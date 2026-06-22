-- Dependency calculation functions for VERA infrastructure
-- Works with infrastructure/infrastructure_dependencies tables

-- ── clear all existing dependencies ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION clear_infrastructure_dependencies()
RETURNS INTEGER AS $$
DECLARE
    count INTEGER;
BEGIN
    SELECT count(*) INTO count FROM infrastructure_dependencies;
    DELETE FROM infrastructure_dependencies;
    RETURN count;
END;
$$ LANGUAGE plpgsql;

-- ── proximity-based dependency calculator ─────────────────────────────────────
-- For each infrastructure of source_subtype, finds the closest of target_subtype
-- and creates a dependency edge.
CREATE OR REPLACE FUNCTION calculate_dependencies_proximity(
    source_subtype TEXT,
    target_subtype TEXT,
    dep_kind TEXT DEFAULT 'depends_on'
)
RETURNS INTEGER AS $$
DECLARE
    rec RECORD;
    closest_id UUID;
    closest_distance FLOAT;
    created_count INTEGER := 0;
BEGIN
    FOR rec IN SELECT id, latitude, longitude FROM infrastructure WHERE subtype = source_subtype LOOP
        SELECT i.id INTO closest_id
        FROM infrastructure i
        WHERE i.subtype = target_subtype
          AND i.id != rec.id
        ORDER BY sqrt(power(i.latitude - rec.latitude, 2) + power(i.longitude - rec.longitude, 2)) ASC
        LIMIT 1;

        IF closest_id IS NOT NULL THEN
            INSERT INTO infrastructure_dependencies (source_id, target_id, kind, weight, reason)
            VALUES (rec.id, closest_id, dep_kind, 0.5, 'proximity')
            ON CONFLICT (source_id, target_id, kind) DO NOTHING;
            created_count := created_count + 1;
        END IF;
    END LOOP;

    RETURN created_count;
END;
$$ LANGUAGE plpgsql;

-- ── random dependency calculator ─────────────────────────────────────────────
-- For each infrastructure of source_subtype, randomly (based on ratio) creates a dependency
-- only if a target of target_subtype exists within max_distance.
CREATE OR REPLACE FUNCTION calculate_dependencies_random(
    source_subtype TEXT,
    target_subtype TEXT,
    max_distance FLOAT,
    ratio FLOAT DEFAULT 0.3,
    dep_kind TEXT DEFAULT 'depends_on'
)
RETURNS INTEGER AS $$
DECLARE
    rec RECORD;
    found_target_id UUID;
    dist FLOAT;
    created_count INTEGER := 0;
BEGIN
    FOR rec IN SELECT id, latitude, longitude FROM infrastructure WHERE subtype = source_subtype LOOP
        IF random() < ratio THEN
            SELECT a.id, sqrt(power(a.latitude - rec.latitude, 2) + power(a.longitude - rec.longitude, 2)) as dist
            INTO found_target_id, dist
            FROM infrastructure a
            WHERE a.subtype = target_subtype
              AND a.id != rec.id
              AND sqrt(power(a.latitude - rec.latitude, 2) + power(a.longitude - rec.longitude, 2)) <= max_distance
            ORDER BY random()
            LIMIT 1;

            IF found_target_id IS NOT NULL THEN
                INSERT INTO infrastructure_dependencies (source_id, target_id, kind, weight, reason)
                VALUES (rec.id, found_target_id, dep_kind, 0.5, 'random')
                ON CONFLICT (source_id, target_id, kind) DO NOTHING;
                created_count := created_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN created_count;
END;
$$ LANGUAGE plpgsql;

-- ── seed common infrastructure dependencies ───────────────────────────────────
-- Run this after loading infrastructure to establish sensible defaults.
-- All critical infrastructure depends on substations for power.
CREATE OR REPLACE FUNCTION seed_infrastructure_dependencies()
RETURNS INTEGER AS $$
DECLARE
    created INTEGER := 0;
BEGIN
    -- Healthcare depends on power
    created := created + calculate_dependencies_proximity('hospital', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('clinic', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('clinic;laboratory', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('laboratory', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('dentist', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('doctor', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('doctors', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('pharmacy', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('blood_donation', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('blood_bank', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('sample_collection', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('rehabilitation', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('birthing_centre', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('physiotherapist', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('podiatrist', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('optometrist', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('psychotherapist', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('alternative', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('counselling', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('vaccination_centre', 'substation', 'powers');

    -- Education depends on power
    created := created + calculate_dependencies_proximity('kindergarten', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('school', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('university', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('college', 'substation', 'powers');

    -- Government/Security depends on power
    created := created + calculate_dependencies_proximity('fire_station', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('police', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('government', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('townhall', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('public', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('social_facility', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('post_office', 'substation', 'powers');

    -- Transportation depends on power
    created := created + calculate_dependencies_proximity('bus_stop', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('railway', 'substation', 'powers');

    -- Commercial depends on power
    created := created + calculate_dependencies_proximity('supermarket', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('convenience_store', 'substation', 'powers');
    created := created + calculate_dependencies_proximity('veterinary', 'substation', 'powers');

    -- Healthcare facilities need water
    created := created + calculate_dependencies_proximity('hospital', 'water_fountain', 'supplies_water');
    created := created + calculate_dependencies_proximity('clinic', 'water_fountain', 'supplies_water');
    created := created + calculate_dependencies_proximity('kindergarten', 'water_fountain', 'supplies_water');
    created := created + calculate_dependencies_proximity('school', 'water_fountain', 'supplies_water');

    -- Healthcare facilities depend on heating (for heat) and water pumps
    created := created + calculate_dependencies_proximity('hospital', 'heating_plant', 'depends_on');
    created := created + calculate_dependencies_proximity('hospital', 'water_pump_station', 'supplies_water');

    -- Heating plants depend on power
    created := created + calculate_dependencies_proximity('heating_plant', 'power_plant', 'powers');
    created := created + calculate_dependencies_proximity('heating_plant', 'substation', 'powers');

    -- Water pump stations depend on water treatment
    created := created + calculate_dependencies_proximity('water_pump_station', 'water_treatment_plant', 'supplies_water');

    -- Wastewater depends on water pumps
    created := created + calculate_dependencies_proximity('wastewater_plant', 'water_pump_station', 'supplies_water');

    -- Industrial facilities depend on power and water
    created := created + calculate_dependencies_proximity('industrial_facility', 'power_plant', 'powers');
    created := created + calculate_dependencies_proximity('industrial_facility', 'water_pump_station', 'supplies_water');

    RETURN created;
END;
$$ LANGUAGE plpgsql;
