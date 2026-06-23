#!/usr/bin/env python3
"""
Standalone dependency-graph advisory CLI.

It takes a dependency graph plus advisory context, sends a strict prompt to a
headless agent CLI, validates the returned JSON shape, and prints structured
data. The prompt explicitly permits the agent to inspect the local data/catalog
paths supplied to it before answering.

Examples:
  python3 advisory_agent.py --agent claude --prompt "Graph: clinic -> substation..."
  python3 advisory_agent.py --agent-command 'codex exec {prompt_file}' --prompt-file graph.txt
  cat graph.txt | python3 advisory_agent.py --agent auto --pretty
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
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "advisory_agent.v1"

OUTPUT_CONTRACT = {
    "schema_version": SCHEMA_VERSION,
    "objective": "string",
    "graph_summary": {
        "nodes_considered": ["node names or ids"],
        "critical_dependencies": ["dependency names or ids"],
        "key_paths": [
            {
                "name": "string",
                "path": ["ordered node names or ids"],
                "why_it_matters": "string",
            }
        ],
    },
    "database_queries": [
        {
            "source": "file/table/path/API name inspected",
            "query_or_method": "string",
            "reason": "string",
            "result_summary": "string",
        }
    ],
    "findings": [
        {
            "title": "string",
            "severity": "low|medium|high|critical",
            "confidence": "low|medium|high",
            "affected_nodes": ["node names or ids"],
            "evidence": ["string"],
            "rationale": "string",
        }
    ],
    "recommendations": [
        {
            "action": "string",
            "priority": "low|medium|high|urgent",
            "target_nodes": ["node names or ids"],
            "expected_effect": "string",
            "dependencies": ["prerequisite actions or assets"],
        }
    ],
    "decision_support": {
        "best_next_action": "string",
        "tradeoffs": ["string"],
        "watchpoints": ["string"],
    },
    "assumptions": ["string"],
    "missing_inputs": ["string"],
}


ADVISORY_INSTRUCTIONS = f"""
You are an infrastructure dependency advisory agent. Analyze the user-provided
dependency graph and produce operational advice.

Rules:
- Treat the graph as the primary task context.
- You may inspect the local database/data paths listed in the prompt before
  answering. Use them to corroborate asset names, types, locations, statuses,
  dependency edges, evidence, or metrics.
- Record every meaningful database/file/API lookup in database_queries.
- Do not claim a lookup was performed unless you actually inspected that source.
- Separate evidence from assumptions.
- Prefer practical sequencing advice over generic resilience commentary.
- Return JSON only. Do not wrap it in Markdown.
- The JSON must match this contract exactly in spirit and include all top-level
  keys shown here:

{json.dumps(OUTPUT_CONTRACT, indent=2)}
""".strip()


@dataclass(frozen=True)
class AgentSpec:
    name: str
    command: list[str]


class AdvisoryError(RuntimeError):
    pass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate dependency-graph advisory guidance using a headless agent.",
    )
    parser.add_argument(
        "--prompt",
        help="Dependency graph and advisory context. If omitted, stdin is used unless --prompt-file is set.",
    )
    parser.add_argument("--prompt-file", type=Path, help="Path to a text file containing the graph/context.")
    parser.add_argument("--objective", help="Optional explicit advisory objective to emphasize.")
    parser.add_argument(
        "--database-root",
        type=Path,
        default=Path("data"),
        help="Local database/data root the agent may inspect. Default: data.",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        action="append",
        default=[],
        help="Additional catalog/data file path the agent may inspect. Can be passed multiple times.",
    )
    parser.add_argument(
        "--agent",
        choices=["auto", "claude", "codex", "cursor"],
        default=os.environ.get("ADVISORY_AGENT", "auto"),
        help="Headless agent to use. Default: auto.",
    )
    parser.add_argument(
        "--agent-command",
        default=os.environ.get("ADVISORY_AGENT_COMMAND"),
        help=(
            "Custom command. Use {prompt} or {prompt_file} placeholders, e.g. "
            "'claude -p {prompt}' or 'codex exec {prompt_file}'."
        ),
    )
    parser.add_argument("--timeout", type=int, default=240, help="Agent timeout in seconds.")
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
    raise AdvisoryError("Provide --prompt, --prompt-file, or pipe context on stdin.")


def readable_path(path: Path) -> str:
    return str(path.expanduser())


def build_agent_prompt(
    user_context: str,
    *,
    objective: str | None,
    database_root: Path,
    catalogs: list[Path],
) -> str:
    objective_line = objective.strip() if objective else "Infer the advisory objective from the graph/context."
    catalog_lines = [f"- {readable_path(path)}" for path in catalogs]
    catalog_block = "\n".join(catalog_lines) if catalog_lines else "- No additional catalog files supplied."

    return f"""
{ADVISORY_INSTRUCTIONS}

Objective: {objective_line}

Local database/data root available for inspection:
{readable_path(database_root)}

Additional catalog/data files available for inspection:
{catalog_block}

Dependency graph and user context:
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
        raise AdvisoryError("--agent-command cannot be empty.")

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
                raise AdvisoryError(
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
        raise AdvisoryError(f"Agent timed out after {args.timeout}s.") from exc
    finally:
        try:
            prompt_file.unlink()
        except OSError:
            pass

    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        detail = stderr or stdout or "no output"
        raise AdvisoryError(f"{agent_name} failed with exit code {completed.returncode}: {detail}")

    output = completed.stdout.strip()
    if not output:
        raise AdvisoryError(f"{agent_name} returned no output.")
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

    raise AdvisoryError("Agent output did not contain a valid JSON object.")


def require_keys(obj: dict[str, Any], keys: list[str], path: str) -> list[str]:
    return [f"{path}.{key}" for key in keys if key not in obj]


def validate_string_list(obj: dict[str, Any], key: str, path: str) -> list[str]:
    value = obj.get(key)
    if not isinstance(value, list):
        return [f"{path}.{key} must be an array."]
    if any(not isinstance(item, str) for item in value):
        return [f"{path}.{key} must contain only strings."]
    return []


def validate_advisory(obj: dict[str, Any]) -> None:
    required = [
        "schema_version",
        "objective",
        "graph_summary",
        "database_queries",
        "findings",
        "recommendations",
        "decision_support",
        "assumptions",
        "missing_inputs",
    ]
    errors = require_keys(obj, required, "$")

    if obj.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"$.schema_version must be {SCHEMA_VERSION!r}.")

    if "graph_summary" in obj and not isinstance(obj["graph_summary"], dict):
        errors.append("$.graph_summary must be an object.")
    elif "graph_summary" in obj:
        graph = obj["graph_summary"]
        errors.extend(require_keys(graph, ["nodes_considered", "critical_dependencies", "key_paths"], "$.graph_summary"))
        for key in ["nodes_considered", "critical_dependencies"]:
            if key in graph:
                errors.extend(validate_string_list(graph, key, "$.graph_summary"))
        if "key_paths" in graph and not isinstance(graph["key_paths"], list):
            errors.append("$.graph_summary.key_paths must be an array.")

    if "database_queries" in obj:
        if not isinstance(obj["database_queries"], list):
            errors.append("$.database_queries must be an array.")
        else:
            for index, query in enumerate(obj["database_queries"]):
                path = f"$.database_queries[{index}]"
                if not isinstance(query, dict):
                    errors.append(f"{path} must be an object.")
                    continue
                errors.extend(require_keys(query, ["source", "query_or_method", "reason", "result_summary"], path))

    if "findings" in obj:
        if not isinstance(obj["findings"], list):
            errors.append("$.findings must be an array.")
        else:
            for index, finding in enumerate(obj["findings"]):
                path = f"$.findings[{index}]"
                if not isinstance(finding, dict):
                    errors.append(f"{path} must be an object.")
                    continue
                errors.extend(
                    require_keys(
                        finding,
                        ["title", "severity", "confidence", "affected_nodes", "evidence", "rationale"],
                        path,
                    ),
                )
                if finding.get("severity") not in {"low", "medium", "high", "critical"}:
                    errors.append(f"{path}.severity must be one of: low, medium, high, critical.")
                if finding.get("confidence") not in {"low", "medium", "high"}:
                    errors.append(f"{path}.confidence must be one of: low, medium, high.")
                for key in ["affected_nodes", "evidence"]:
                    if key in finding:
                        errors.extend(validate_string_list(finding, key, path))

    if "recommendations" in obj:
        if not isinstance(obj["recommendations"], list):
            errors.append("$.recommendations must be an array.")
        else:
            for index, recommendation in enumerate(obj["recommendations"]):
                path = f"$.recommendations[{index}]"
                if not isinstance(recommendation, dict):
                    errors.append(f"{path} must be an object.")
                    continue
                errors.extend(
                    require_keys(
                        recommendation,
                        ["action", "priority", "target_nodes", "expected_effect", "dependencies"],
                        path,
                    ),
                )
                if recommendation.get("priority") not in {"low", "medium", "high", "urgent"}:
                    errors.append(f"{path}.priority must be one of: low, medium, high, urgent.")
                for key in ["target_nodes", "dependencies"]:
                    if key in recommendation:
                        errors.extend(validate_string_list(recommendation, key, path))

    if "decision_support" in obj and not isinstance(obj["decision_support"], dict):
        errors.append("$.decision_support must be an object.")
    elif "decision_support" in obj:
        support = obj["decision_support"]
        errors.extend(require_keys(support, ["best_next_action", "tradeoffs", "watchpoints"], "$.decision_support"))
        for key in ["tradeoffs", "watchpoints"]:
            if key in support:
                errors.extend(validate_string_list(support, key, "$.decision_support"))

    for key in ["assumptions", "missing_inputs"]:
        if key in obj:
            errors.extend(validate_string_list(obj, key, "$"))

    if errors:
        raise AdvisoryError("Invalid advisory JSON:\n" + "\n".join(f"- {error}" for error in errors))


def main(argv: list[str]) -> int:
    try:
        args = parse_args(argv)
        user_context = read_user_context(args)
        agent_prompt = build_agent_prompt(
            user_context,
            objective=args.objective,
            database_root=args.database_root,
            catalogs=args.catalog,
        )

        if args.print_agent_prompt:
            print(agent_prompt)
            return 0

        agent_output = run_agent(args, agent_prompt)
        advisory = extract_json_object(agent_output)
        validate_advisory(advisory)

        rendered = json.dumps(advisory, indent=2 if args.pretty else None, sort_keys=False)
        if args.output:
            args.output.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0
    except AdvisoryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
