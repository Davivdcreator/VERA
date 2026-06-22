#!/usr/bin/env python3
"""
Standalone rebuild-cost estimator CLI.

It takes free-form context, sends a strict cost-estimation prompt to a headless
agent CLI, validates the returned JSON shape, and prints structured data.

Examples:
  python3 rebuild_cost_agent.py --agent claude --prompt "Rebuild the north water plant..."
  python3 rebuild_cost_agent.py --agent-command 'codex exec {prompt_file}' --prompt-file context.txt
  cat context.txt | python3 rebuild_cost_agent.py --agent auto --pretty
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "rebuild_cost_agent.v1"

OUTPUT_CONTRACT = {
    "schema_version": SCHEMA_VERSION,
    "target": {
        "name": "string",
        "description": "string",
        "location": "string|null",
        "asset_type": "building|infrastructure|system|unknown",
        "scope_summary": "string",
    },
    "viability": {
        "is_viable_now": "boolean",
        "reason": "string",
        "blocking_dependencies": ["dependency names that must be rebuilt first"],
        "critical_path": ["ordered dependency names, then target name"],
    },
    "dependencies": [
        {
            "name": "string",
            "description": "string",
            "why_required_first": "string",
            "rebuild_first": True,
            "cost": {
                "currency": "ISO-4217 code",
                "low": 0,
                "expected": 0,
                "high": 0,
                "confidence": "low|medium|high",
            },
            "assumptions": ["string"],
            "missing_inputs": ["string"],
        }
    ],
    "target_cost": {
        "currency": "ISO-4217 code",
        "low": 0,
        "expected": 0,
        "high": 0,
        "confidence": "low|medium|high",
        "basis_date": "YYYY-MM-DD",
    },
    "total_program_cost": {
        "currency": "ISO-4217 code",
        "low": 0,
        "expected": 0,
        "high": 0,
        "includes_dependencies": True,
    },
    "line_items": [
        {
            "name": "string",
            "category": "demolition|hard_cost|utilities|dependency|soft_cost|contingency|other",
            "applies_to": "target or dependency name",
            "low": 0,
            "expected": 0,
            "high": 0,
            "notes": "string",
        }
    ],
    "assumptions": ["string"],
    "risks": ["string"],
    "missing_inputs": ["string"],
    "recommended_next_steps": ["string"],
}


ESTIMATION_INSTRUCTIONS = f"""
You are a cost-estimation agent. Estimate the planning-level cost to rebuild
the target described by the user-provided context.

Rules:
- Use only the context in the prompt plus clearly-labeled assumptions.
- Identify dependencies that must be rebuilt first to make the target viable.
- Do not list nice-to-have work as a blocking dependency.
- Estimate the target rebuild cost and each blocking dependency cost.
- Estimate total program cost as target cost plus blocking dependencies.
- Use ranges, not false precision.
- Keep values numeric, in the requested currency.
- Confidence is low unless the prompt gives measured quantities and reliable
  damage/scope evidence.
- Return JSON only. Do not wrap it in Markdown.
- The JSON must match this contract exactly in spirit and include all top-level
  keys shown here:

{json.dumps(OUTPUT_CONTRACT, indent=2)}
""".strip()


@dataclass(frozen=True)
class AgentSpec:
    name: str
    command: list[str]


class EstimateError(RuntimeError):
    pass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Estimate rebuild cost and prerequisite rebuild dependencies using a headless agent.",
    )
    parser.add_argument(
        "--prompt",
        help="Free-form context to estimate from. If omitted, stdin is used unless --prompt-file is set.",
    )
    parser.add_argument("--prompt-file", type=Path, help="Path to a text file containing context.")
    parser.add_argument("--target", help="Optional explicit target name/scope to emphasize.")
    parser.add_argument("--currency", default="USD", help="ISO-4217 currency code. Default: USD.")
    parser.add_argument(
        "--basis-date",
        default=date.today().isoformat(),
        help="Price basis date passed to the agent. Default: today.",
    )
    parser.add_argument(
        "--agent",
        choices=["auto", "claude", "codex", "cursor"],
        default=os.environ.get("REBUILD_COST_AGENT", "auto"),
        help="Headless agent to use. Default: auto.",
    )
    parser.add_argument(
        "--agent-command",
        default=os.environ.get("REBUILD_COST_AGENT_COMMAND"),
        help=(
            "Custom command. Use {prompt} or {prompt_file} placeholders, e.g. "
            "'claude -p {prompt}' or 'codex exec {prompt_file}'."
        ),
    )
    parser.add_argument("--timeout", type=int, default=180, help="Agent timeout in seconds.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON.")
    parser.add_argument("--output", type=Path, help="Optional path to write JSON output.")
    parser.add_argument(
        "--print-agent-prompt",
        action="store_true",
        help="Print the final prompt sent to the agent and exit.",
    )
    return parser.parse_args(argv)


def read_user_context(args: argparse.Namespace) -> str:
    if args.prompt_file:
        return args.prompt_file.read_text(encoding="utf-8").strip()
    if args.prompt:
        return args.prompt.strip()
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    raise EstimateError("Provide --prompt, --prompt-file, or pipe context on stdin.")


def build_agent_prompt(
    user_context: str,
    *,
    target: str | None,
    currency: str,
    basis_date: str,
) -> str:
    target_line = target.strip() if target else "Infer the rebuild target from the context."
    return f"""
{ESTIMATION_INSTRUCTIONS}

Requested currency: {currency.upper()}
Price basis date: {basis_date}
Target: {target_line}

User context:
{user_context}
""".strip()


def available_builtin_agents(choice: str) -> list[AgentSpec]:
    candidates = [
        AgentSpec("claude", ["claude", "-p"]),
        AgentSpec("codex", ["codex", "exec", "--skip-git-repo-check"]),
        AgentSpec("cursor", ["cursor-agent", "-p"]),
    ]
    if choice == "auto":
        return [candidate for candidate in candidates if shutil.which(candidate.command[0])]
    for candidate in candidates:
        if candidate.name == choice and shutil.which(candidate.command[0]):
            return [candidate]
    return []


def command_from_template(template: str, prompt: str, prompt_file: Path) -> list[str]:
    parts = shlex.split(template)
    if not parts:
        raise EstimateError("--agent-command cannot be empty.")

    rendered: list[str] = []
    used_placeholder = False
    for part in parts:
        if "{prompt}" in part or "{prompt_file}" in part:
            used_placeholder = True
        rendered.append(
            part.replace("{prompt}", prompt).replace("{prompt_file}", str(prompt_file)),
        )

    if not used_placeholder:
        rendered.append(prompt)
    return rendered


def run_agent(args: argparse.Namespace, prompt: str) -> str:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".prompt.txt", delete=False) as f:
        f.write(prompt)
        prompt_file = Path(f.name)

    try:
        if args.agent_command:
            command = command_from_template(args.agent_command, prompt, prompt_file)
            agent_name = command[0]
        else:
            agents = available_builtin_agents(args.agent)
            if not agents:
                requested = args.agent if args.agent != "auto" else "claude, codex, or cursor-agent"
                raise EstimateError(
                    f"No headless agent found for {requested}. Install one or pass --agent-command.",
                )
            agent = agents[0]
            command = [*agent.command, prompt]
            agent_name = agent.name

        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=args.timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise EstimateError(f"Agent timed out after {args.timeout}s.") from exc
    finally:
        try:
            prompt_file.unlink()
        except OSError:
            pass

    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        detail = stderr or stdout or "no output"
        raise EstimateError(f"{agent_name} failed with exit code {completed.returncode}: {detail}")

    output = completed.stdout.strip()
    if not output:
        raise EstimateError(f"{agent_name} returned no output.")
    return output


def extract_json_object(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()

    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`").strip()
        if stripped.startswith("json"):
            stripped = stripped[4:].strip()

    for index, char in enumerate(stripped):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(stripped[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            return obj

    raise EstimateError("Agent output did not contain a valid JSON object.")


def require_keys(obj: dict[str, Any], keys: list[str], path: str) -> list[str]:
    return [f"{path}.{key}" for key in keys if key not in obj]


def validate_cost_range(obj: Any, path: str) -> list[str]:
    if not isinstance(obj, dict):
        return [f"{path} must be an object."]
    errors = require_keys(obj, ["currency", "low", "expected", "high"], path)
    for key in ["low", "expected", "high"]:
        if key in obj and not isinstance(obj[key], (int, float)):
            errors.append(f"{path}.{key} must be numeric.")
    if all(isinstance(obj.get(key), (int, float)) for key in ["low", "expected", "high"]):
        if not obj["low"] <= obj["expected"] <= obj["high"]:
            errors.append(f"{path} must satisfy low <= expected <= high.")
    return errors


def validate_estimate(obj: dict[str, Any]) -> None:
    required = [
        "schema_version",
        "target",
        "viability",
        "dependencies",
        "target_cost",
        "total_program_cost",
        "line_items",
        "assumptions",
        "risks",
        "missing_inputs",
        "recommended_next_steps",
    ]
    errors = require_keys(obj, required, "$")

    if obj.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"$.schema_version must be {SCHEMA_VERSION!r}.")

    if "target" in obj and not isinstance(obj["target"], dict):
        errors.append("$.target must be an object.")
    elif "target" in obj:
        errors.extend(require_keys(obj["target"], ["name", "description", "asset_type", "scope_summary"], "$.target"))

    if "viability" in obj and not isinstance(obj["viability"], dict):
        errors.append("$.viability must be an object.")
    elif "viability" in obj:
        errors.extend(
            require_keys(
                obj["viability"],
                ["is_viable_now", "reason", "blocking_dependencies", "critical_path"],
                "$.viability",
            ),
        )

    if "dependencies" in obj:
        if not isinstance(obj["dependencies"], list):
            errors.append("$.dependencies must be an array.")
        else:
            for index, dep in enumerate(obj["dependencies"]):
                path = f"$.dependencies[{index}]"
                if not isinstance(dep, dict):
                    errors.append(f"{path} must be an object.")
                    continue
                errors.extend(require_keys(dep, ["name", "why_required_first", "rebuild_first", "cost"], path))
                if dep.get("rebuild_first") is not True:
                    errors.append(f"{path}.rebuild_first must be true for blocking dependencies.")
                if "cost" in dep:
                    errors.extend(validate_cost_range(dep["cost"], f"{path}.cost"))

    if "target_cost" in obj:
        errors.extend(validate_cost_range(obj["target_cost"], "$.target_cost"))
    if "total_program_cost" in obj:
        errors.extend(validate_cost_range(obj["total_program_cost"], "$.total_program_cost"))

    for key in ["line_items", "assumptions", "risks", "missing_inputs", "recommended_next_steps"]:
        if key in obj and not isinstance(obj[key], list):
            errors.append(f"$.{key} must be an array.")

    if errors:
        raise EstimateError("Invalid estimate JSON:\n" + "\n".join(f"- {error}" for error in errors))


def main(argv: list[str]) -> int:
    try:
        args = parse_args(argv)
        user_context = read_user_context(args)
        agent_prompt = build_agent_prompt(
            user_context,
            target=args.target,
            currency=args.currency,
            basis_date=args.basis_date,
        )

        if args.print_agent_prompt:
            print(agent_prompt)
            return 0

        agent_output = run_agent(args, agent_prompt)
        estimate = extract_json_object(agent_output)
        validate_estimate(estimate)

        rendered = json.dumps(estimate, indent=2 if args.pretty else None, sort_keys=False)
        if args.output:
            args.output.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0
    except EstimateError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
