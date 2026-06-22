# Infrastructure Dependencies

This document lists all infrastructure dependency relationships created by `seed_infrastructure_dependencies()` in `pg/migrations/0002_dependency_functions.sql`.

Dependencies are calculated using proximity: each source asset is linked to its nearest target asset of the specified type.

## Dependency Kinds

| Kind | Description |
|------|-------------|
| `powers` | Target provides electrical power to source |
| `supplies_water` | Target provides water supply to source |
| `depends_on` | Source depends on target for operation |

---

## Healthcare → Power (powers)

All healthcare facilities depend on substations for electrical power.

| Source Subtype | Target |
|----------------|--------|
| `hospital` | substation |
| `clinic` | substation |
| `clinic;laboratory` | substation |
| `laboratory` | substation |
| `dentist` | substation |
| `doctor` | substation |
| `doctors` | substation |
| `pharmacy` | substation |
| `blood_donation` | substation |
| `blood_bank` | substation |
| `sample_collection` | substation |
| `rehabilitation` | substation |
| `birthing_centre` | substation |
| `physiotherapist` | substation |
| `podiatrist` | substation |
| `optometrist` | substation |
| `psychotherapist` | substation |
| `alternative` | substation |
| `counselling` | substation |
| `vaccination_centre` | substation |

---

## Education → Power (powers)

| Source Subtype | Target |
|----------------|--------|
| `kindergarten` | substation |
| `school` | substation |
| `university` | substation |
| `college` | substation |

---

## Government/Security → Power (powers)

| Source Subtype | Target |
|----------------|--------|
| `fire_station` | substation |
| `police` | substation |
| `government` | substation |
| `townhall` | substation |
| `public` | substation |
| `social_facility` | substation |
| `post_office` | substation |

---

## Transportation → Power (powers)

| Source Subtype | Target |
|----------------|--------|
| `bus_stop` | substation |
| `railway` | substation |

---

## Commercial → Power (powers)

| Source Subtype | Target |
|----------------|--------|
| `supermarket` | substation |
| `convenience_store` | substation |
| `veterinary` | substation |

---

## Healthcare → Water (supplies_water)

| Source Subtype | Target |
|----------------|--------|
| `hospital` | water_fountain |
| `clinic` | water_fountain |
| `kindergarten` | water_fountain |
| `school` | water_fountain |

---

## Hospital → Heating + Water Pump (depends_on, supplies_water)

| Source | Target | Kind |
|--------|--------|------|
| `hospital` | `heating_plant` | `depends_on` |
| `hospital` | `water_pump_station` | `supplies_water` |

---

## Heating Plants → Power (powers)

| Source | Target | Kind |
|--------|--------|------|
| `heating_plant` | `power_plant` | `powers` |
| `heating_plant` | `substation` | `powers` |

---

## Water System Dependencies

| Source | Target | Kind |
|--------|--------|------|
| `water_pump_station` | `water_treatment_plant` | `supplies_water` |
| `wastewater_plant` | `water_pump_station` | `supplies_water` |

---

## Industrial → Power + Water (powers, supplies_water)

| Source | Target | Kind |
|--------|--------|------|
| `industrial_facility` | `power_plant` | `powers` |
| `industrial_facility` | `water_pump_station` | `supplies_water` |

---

## Dependency Chain Summary

```
power_plant ──────────────────────┬──> substation (OSM data)
                                 │
heating_plant ───────────────────┼──> power_plant
                                 ├──> substation
                                 │
water_treatment_plant ───────────<  (source, no upstream)
                                 │
water_pump_station ──────────────┴──> water_treatment_plant
                                 │
wastewater_plant ────────────────┴──> water_pump_station
                                 │
industrial_facility ─────────────┼──> power_plant
                                 └──> water_pump_station
                                 │
hospital ────────────────────────┼──> substation (OSM data) [existing]
                                 ├──> heating_plant [new]
                                 └──> water_pump_station [new]
```

---

## Statistics

From a typical run with real OSM data (~16,200 assets) + fake data (46 assets):

| Kind | Approx Count | Reason |
|------|-------------|--------|
| `powers` | ~15,600 | Healthcare, Education, Gov, Transport, Commercial, Heating, Industrial |
| `supplies_water` | ~4,700 | Healthcare, Hospital, Water pumps, Wastewater, Industrial |
| `depends_on` | ~500 | Hospital→Heating, Heating→Power |

**Total dependencies: ~20,900**
