Save this as:

```
data/medications/adult.json

```

This is an **initial adult medication table** for the RTC, trauma and overdose pathways. Codex can reuse it by referencing medication IDs from each pathway.

```
{
  "schema_version": "1.0.0",
  "rp_only": true,
  "age_group": "16+",
  "global_warning": "REAL MEDICATION INFORMATION — FIVEM ROLE-PLAY ONLY. This content is fictionalised for FiveM gameplay and must not be used to diagnose or treat a real person. In a real emergency, call 999 or 112.",
  "administration_requirements": [
    "Confirm the patient's age group is 16 years or older.",
    "Confirm allergy status before administration.",
    "Record relevant observations before administration.",
    "Check consciousness, respiratory rate, oxygen saturation and blood pressure.",
    "Check pregnancy status where relevant.",
    "Check relevant renal and hepatic history.",
    "Check which medicines have already been administered.",
    "Record medication name, dose, route, time, staff member and response.",
    "Repeat observations after administration.",
    "High-risk medicines require senior RP clinician authorisation."
  ],
  "medications": [
    {
      "id": "morphine-sulfate-iv-adult",
      "generic_name": "Morphine sulfate",
      "display_name": "Morphine sulfate injection",
      "category": "Analgesia",
      "routes": [
        "intravenous"
      ],
      "concentration_examples": [
        "1 mg/mL solution for injection"
      ],
      "indications": [
        "Moderate to severe traumatic pain",
        "Severe acute pain where opioid analgesia is appropriate"
      ],
      "adult_dose": {
        "initial": "1-10 mg IV",
        "administration": "Give slowly over 4-5 minutes",
        "maximum_initial_loading_dose": "15 mg",
        "repeat": "Only after reassessment and according to the authorised pathway or local RP protocol",
        "dose_adjustment": "Use a reduced dose in older, frail or opioid-sensitive patients"
      },
      "rp_display_dose": "1-10 mg IV slowly over 4-5 minutes; maximum initial loading dose 15 mg. RP-ONLY DOSE.",
      "do_not_give_if": [
        "Respiratory depression",
        "Coma or markedly reduced consciousness",
        "Known morphine or opioid hypersensitivity",
        "Acute severe asthma or severe obstructive airway disease",
        "Acute alcoholism or significant alcohol intoxication",
        "Suspected raised intracranial pressure or serious head injury without senior authorisation",
        "Moderate to severe renal impairment",
        "Severe or acute liver failure",
        "Recent monoamine oxidase inhibitor use",
        "Severe uncontrolled hypotension or shock without senior authorisation"
      ],
      "cautions": [
        "Older age",
        "Frailty",
        "Hypotension",
        "Shock",
        "Pregnancy",
        "Breastfeeding",
        "Concurrent alcohol use",
        "Concurrent benzodiazepines or sedatives",
        "Concurrent central nervous system depressants",
        "Previous opioid dependence or opioid tolerance"
      ],
      "required_pre_administration_checks": [
        "Respiratory rate",
        "Oxygen saturation",
        "Blood pressure",
        "Heart rate",
        "Consciousness or sedation level",
        "Pain score",
        "Allergy status",
        "Recent opioid or sedative administration"
      ],
      "monitoring_after_administration": [
        "Respiratory rate",
        "Oxygen saturation",
        "Consciousness or sedation level",
        "Blood pressure",
        "Heart rate",
        "Pain score",
        "Nausea or vomiting"
      ],
      "important_adverse_effects": [
        "Respiratory depression",
        "Drowsiness",
        "Reduced consciousness",
        "Hypotension",
        "Nausea",
        "Vomiting",
        "Confusion",
        "Pruritus",
        "Urinary retention",
        "Constipation"
      ],
      "important_interactions": [
        "Alcohol",
        "Benzodiazepines",
        "Sedatives",
        "Anaesthetic agents",
        "Other opioids",
        "Other central nervous system depressants",
        "Monoamine oxidase inhibitors"
      ],
      "overdose_trigger": {
        "if": [
          "Respiratory rate below 10/min",
          "Falling oxygen saturation",
          "Marked sedation",
          "Loss of airway protection",
          "Pinpoint pupils with respiratory depression"
        ],
        "action": [
          "Block further opioid administration.",
          "Escalate immediately to the senior RP clinician.",
          "Start the opioid toxicity pathway.",
          "Consider naloxone according to the naloxone medication entry.",
          "Repeat airway and breathing assessment."
        ]
      },
      "senior_authorisation_required": true,
      "rp_only": true,
      "source": {
        "title": "Morphine sulfate 1 mg in 1 mL solution for injection — MHRA Summary of Product Characteristics",
        "url": "https://mhraproducts4853.blob.core.windows.net/docs/4bae43d632c68ff32aa2f8ad18092dbd4b119716"
      },
      "last_reviewed": "2025-02-01"
    },
    {
      "id": "tranexamic-acid-iv-trauma-adult",
      "generic_name": "Tranexamic acid",
      "display_name": "Tranexamic acid injection",
      "category": "Haemorrhage control",
      "routes": [
        "intravenous"
      ],
      "concentration_examples": [
        "100 mg/mL solution for injection",
        "500 mg/5 mL solution for injection"
      ],
      "indications": [
        "Major trauma with active bleeding",
        "Major trauma with suspected significant haemorrhage",
        "Major trauma with a high risk of significant haemorrhage"
      ],
      "adult_dose": {
        "loading_dose": "1 g IV",
        "loading_administration": "Give over 10 minutes",
        "maintenance_dose": "1 g IV infusion over 8 hours",
        "time_limit": "Give as soon as possible and normally within 3 hours of injury"
      },
      "rp_display_dose": "1 g IV over 10 minutes, followed by 1 g IV infusion over 8 hours. RP-ONLY DOSE.",
      "do_not_give_if": [
        "More than 3 hours since injury unless a senior clinician documents a specific reason",
        "Known hypersensitivity to tranexamic acid",
        "Acute venous thrombosis",
        "Acute arterial thrombosis",
        "History of seizures unless specifically authorised",
        "Severe renal impairment without an approved renal-adjusted protocol"
      ],
      "cautions": [
        "History of seizures",
        "Severe renal impairment",
        "Known thromboembolic disease",
        "Suspected disseminated intravascular coagulation",
        "Uncertainty about the time of injury"
      ],
      "required_pre_administration_checks": [
        "Time of injury",
        "Evidence of active or suspected major bleeding",
        "Known thrombosis",
        "History of seizures",
        "Renal history",
        "Allergy status"
      ],
      "monitoring_after_administration": [
        "Ongoing external bleeding",
        "Heart rate",
        "Blood pressure",
        "Mental state",
        "Response to haemorrhage control",
        "Evidence of deterioration"
      ],
      "important_adverse_effects": [
        "Nausea",
        "Vomiting",
        "Hypotension if administered too rapidly",
        "Seizures",
        "Thromboembolic complications",
        "Hypersensitivity reaction"
      ],
      "important_interactions": [
        "Other antifibrinolytic medicines",
        "Medicines increasing thrombotic risk"
      ],
      "administration_warning": "Do not administer rapidly as an undiluted IV bolus in the RP system. Record the start and completion time of the infusion.",
      "senior_authorisation_required": true,
      "rp_only": true,
      "source": {
        "title": "NICE: Major trauma: assessment and initial management",
        "url": "https://www.nice.org.uk/guidance/ng39/chapter/recommendations"
      },
      "dose_source": {
        "title": "NICE evidence review: tranexamic acid in major trauma",
        "url": "https://www.nice.org.uk/guidance/ng39/evidence/full-guideline-pdf-2308122833"
      },
      "last_reviewed": "2025-02-01"
    },
    {
      "id": "naloxone-iv-opioid-toxicity-adult",
      "generic_name": "Naloxone hydrochloride",
      "display_name": "Naloxone injection",
      "category": "Antidote",
      "routes": [
        "intravenous",
        "intramuscular",
        "intraosseous"
      ],
      "concentration_examples": [
        "400 micrograms/mL solution for injection or infusion"
      ],
      "indications": [
        "Suspected opioid toxicity with respiratory depression",
        "Suspected opioid overdose with inadequate airway protection",
        "Opioid-induced respiratory depression"
      ],
      "adult_dose": {
        "initial_iv_or_io": "100-400 micrograms IV or IO",
        "repeat": "Repeat small doses every 60 seconds according to response",
        "severe_toxicity": "Larger cumulative doses may be required in severe toxicity or potent-opioid exposure",
        "intramuscular": "400 micrograms IM when IV or IO access is unavailable",
        "infusion": "Requires senior clinician authorisation and an appropriate infusion protocol"
      },
      "rp_display_dose": "For opioid-related respiratory depression, give 100-400 micrograms IV/IO and titrate to adequate breathing. Repeat according to the overdose pathway. RP-ONLY DOSE.",
      "treatment_goal": "Restore adequate respiratory effort and airway protection, not necessarily complete reversal of unconsciousness or analgesia.",
      "do_not_give_if": [
        "No evidence of opioid toxicity",
        "Normal breathing with no respiratory compromise",
        "Known hypersensitivity unless the patient is in a life-threatening opioid emergency"
      ],
      "cautions": [
        "Long-acting opioids",
        "Methadone exposure",
        "Potent synthetic opioid exposure",
        "Opioid dependence",
        "Mixed overdose",
        "Stimulant co-use",
        "Risk of acute opioid withdrawal",
        "Pulmonary oedema after reversal"
      ],
      "required_pre_administration_checks": [
        "Respiratory rate",
        "Oxygen saturation",
        "Consciousness",
        "Pupil findings",
        "Evidence of opioid exposure",
        "Blood glucose where appropriate",
        "Consideration of alternative diagnoses"
      ],
      "monitoring_after_administration": [
        "Respiratory rate",
        "Oxygen saturation",
        "Consciousness",
        "Airway protection",
        "Heart rate",
        "Blood pressure",
        "Agitation or acute withdrawal",
        "Recurrence of respiratory depression"
      ],
      "important_adverse_effects": [
        "Acute opioid withdrawal",
        "Agitation",
        "Pain crisis",
        "Nausea",
        "Vomiting",
        "Tachycardia",
        "Hypertension",
        "Pulmonary oedema",
        "Seizures in complex or mixed toxicity"
      ],
      "important_interactions": [
        "Reverses the effects of opioid medicines",
        "May precipitate acute withdrawal in opioid-dependent patients"
      ],
      "observation_requirement": [
        "Continue close monitoring after the last naloxone dose.",
        "The observation period must be longer for long-acting opioids or recurrent respiratory depression.",
        "Escalate if repeated boluses are required."
      ],
      "senior_authorisation_required": true,
      "rp_only": true,
      "source": {
        "title": "NHS Specialist Pharmacy Service: Reversing an adult opioid overdose with naloxone",
        "url": "https://www.sps.nhs.uk/articles/reversing-an-adult-opioid-overdose-with-naloxone/"
      },
      "product_source": {
        "title": "Naloxone 400 micrograms/mL solution for injection or infusion — MHRA Summary of Product Characteristics",
        "url": "https://mhraproducts4853.blob.core.windows.net/docs/03256f422edd052a167aedf9046e55f28f685c6c"
      },
      "last_reviewed": "2025-02-01"
    }
  ]
}

```

## How pathways should reference the table

In `road-traffic-collision.json`, replace the full medication objects with medication IDs:

```
"medications": [
  {
    "medication_id": "morphine-sulfate-iv-adult",
    "when_to_consider": "Severe traumatic pain after the primary survey",
    "requires_senior_authorisation": true
  },
  {
    "medication_id": "tranexamic-acid-iv-trauma-adult",
    "when_to_consider": "Major trauma with active or suspected significant haemorrhage",
    "requires_senior_authorisation": true
  }
]

```

Codex should then:

1. Load `data/medications/adult.json`.
2. Find the matching `medication_id`.
3. Display the relevant medication information.
4. Check prerequisites before enabling administration.
5. Log the selected dose, route, time and user.
6. Trigger reassessment automatically.
7. Prevent contraindicated medication selection.
8. Display the RP-only warning every time.

The morphine dose and contraindications are based on the MHRA product information. [1]            NICE recommends IV tranexamic acid as soon as possible in major trauma with active or suspected active bleeding and advises against routine administration more than 3 hours after injury. [2]            The trauma regimen of 1 g over 10 minutes followed by 1 g over 8 hours is reflected in the NICE evidence review. [3]            Naloxone dosing and monitoring should follow the current NHS Specialist Pharmacy Service guidance. [4]          &#x20;

### References

1. [MORPHINE SULFATE 1MG IN 1ML SOLUTION FOR INJECTION.](https://mhraproducts4853.blob.core.windows.net/docs/4bae43d632c68ff32aa2f8ad18092dbd4b119716)                                                                                                                         &#x20;

   mhra.gov.uk > ... > Summary of product characteristics > spc-doc_PL 13079-0001.pdf

   Active substances: MORPHINE SULFATE, last read 2026-09-28
2. [Major trauma: assessment and initial management](https://www.nice.org.uk/guidance/ng39/chapter/recommendations)                                                                                                                         &#x20;

   www\.nice.org.uk › ... › ng39 › chapter › recommendations
3. [Major trauma: assessment and initial management - NICE](https://www.nice.org.uk/guidance/ng39/evidence/full-guideline-pdf-2308122833)                                                                                                                         &#x20;

   www\.nice.org.uk › ... › full-guideline-pdf-2308122833
4. [www.sps.nhs.uk](https://www.sps.nhs.uk/articles/reversing-an-adult-opioid-overdose-with-naloxone/)                                                                                                                                                                          &#x20;