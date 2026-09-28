Below are two files:

1. `codex-batch-1-implementation-prompt.md`
2. `data/pathways/trauma/road-traffic-collision.json`

Assumptions: **adult patients aged 16+**, UK terminology, FiveM role-play only, and a fictional EMS/ED workflow. The real medication doses are included for realism, but they must not be used outside the game.

---

## 1. `codex-batch-1-implementation-prompt.md`

````
# Codex Implementation Prompt — Medical RP Pathway System

## Project

Implement a searchable medical role-play pathway system for the existing FiveM medical RP website.

The website is for fictional gameplay and must not be presented as real medical advice.

## Mandatory global disclaimer

Display this disclaimer prominently on:

- The medical guides landing page
- Every pathway page
- Every medication section
- Every printable page
- Any dose-confirmation modal
- The website footer

&gt; REAL MEDICATION INFORMATION — FIVEM ROLE-PLAY ONLY  
&gt; This content is fictionalised for FiveM gameplay. It is not medical advice, prescribing guidance, clinical training or a substitute for a qualified healthcare professional. Do not use this information to diagnose or treat a real person. In a real emergency, call 999 or 112.

Add a checkbox before medication administration:

&gt; I understand that this medication information is for FiveM role-play only and must not be used in real life.

The medication action must remain disabled until this checkbox is selected.

## Patient scope

The initial release covers adults aged 16 years and over.

Do not display paediatric doses in adult pathways. Add a visible message:

&gt; Paediatric patients require a separate pathway and weight-based assessment. Escalate to senior staff.

## Pathway data structure

Store each clinical pathway as an individual JSON file in:

```text
data/pathways/{category}/{pathway-id}.json

````

The application must automatically discover and load pathway files from the pathway index.

Each pathway must support:

- Search
- Category filtering
- Severity filtering
- Expand/collapse sections
- Step-by-step mode
- Quick-reference mode
- Printable mode
- Patient dialogue
- Random observation generation
- Reassessment
- Deterioration branches
- Treatment logging
- Medication logging
- Handover generation
- Documentation checklist
- Senior escalation
- Audit history

## Required pathway sections

Every pathway JSON file must contain:

- id
- title
- category
- age_group
- rp_only
- disclaimer
- severity
- incident_description
- scene_safety
- mechanism_questions
- initial_impression
- primary_survey
- observations
- focused_examination
- differential_diagnoses
- likely_rp_diagnoses
- immediate_management
- medications
- reassessment
- escalation_criteria
- disposition
- handover
- documentation
- complications
- example_cases
- sources
- last_reviewed

## Clinical workflow

The normal workflow must be:

1. Scene safety
2. Mechanism of injury
3. Initial impression
4. Catastrophic haemorrhage
5. Airway with spinal protection
6. Breathing
7. Circulation
8. Disability
9. Exposure and environment
10. Initial observations
11. Focused examination
12. Differential diagnoses
13. Working RP diagnosis
14. Immediate treatment
15. Reassessment
16. Handover
17. Destination and disposition
18. Documentation

Use `&lt;C&gt;ABCDE` terminology.

## Do not oversimplify diagnosis

Do not automatically assign a diagnosis from the incident type.

For example:

- An RTC may cause minor bruising, fracture, internal bleeding, head injury, spinal injury, chest injury or multiple trauma.
- Normal initial observations must not automatically mean the patient is safe.
- A patient may initially appear stable and then deteriorate.
- A low blood pressure reading should be interpreted with the mechanism, pulse, skin signs, mental state and trend.
- A negative finding must be recorded where relevant.

## Observation system

Include:

- Heart rate
- Respiratory rate
- Blood pressure
- Oxygen saturation
- Temperature
- Glasgow Coma Scale
- Pupils
- Blood glucose where relevant
- Pain score
- Skin colour
- Skin temperature
- Capillary refill
- Distal pulse where a limb injury is present

Display observations as trends rather than isolated values.

Provide mild, moderate and severe examples, but label them as fictional RP observations.

## Medication system

Medication data must be stored separately from pathway files.

Each medication must include:

- Generic name
- Brand names where relevant
- Dose
- Route
- Administration rate
- Repeat interval
- Maximum dose
- Indication
- Contraindications
- Cautions
- Adverse effects
- Interactions
- Monitoring
- Pregnancy warning
- Renal and hepatic cautions
- Senior authorisation requirement
- Source URL
- Source review date

Do not allow a medication to be selected unless the user has documented:

- Allergy status
- Age
- Consciousness
- Respiratory rate
- Oxygen saturation
- Blood pressure
- Relevant contraindications
- Previous medication administration

High-risk medications such as opioids, sedatives, ketamine, naloxone and adrenaline must require senior authorisation.

Never combine multiple opioid doses automatically.

After opioid administration, generate a mandatory reassessment task for:

- Respiratory rate
- Oxygen saturation
- Consciousness/sedation
- Blood pressure
- Pain score

If respiratory depression or reduced consciousness is selected, the system must block further opioid administration and display:

\> Do not administer further opioid medication. Escalate immediately and follow the overdose/respiratory depression pathway.

## Dose display

Every dose must display:

```
RP-ONLY DOSE — NOT FOR REAL-WORLD USE

```

Doses must not be hard-coded into the frontend. Load them from:

```
data/medications/adult.json

```

## Handover

Generate a structured ATMIST handover containing:

- Age and sex
- Time of incident
- Mechanism
- Injuries suspected
- Signs and observations
- Glasgow Coma Scale
- Treatment given
- Response to treatment
- Estimated time of arrival
- Special requirements

Example:

\> This is a 32-year-old following a high-speed road traffic collision at 14:20. The patient has suspected chest and left femur injuries. Initial GCS is 15. Pulse is 118, respiratory rate 26, blood pressure 102/68 and oxygen saturation 95% on air. There is left thigh deformity and controlled external bleeding. Morphine was administered under the RP medication protocol. The patient remains haemodynamically borderline and is being transported to the major trauma centre.

## Technical requirements

- Preserve the existing website design system.
- Use responsive design.
- Ensure full mobile compatibility.
- Use semantic HTML.
- Add keyboard accessibility.
- Add ARIA labels to interactive controls.
- Do not remove existing website content.
- Add error handling for invalid JSON.
- Add a pathway index and category index.
- Add a medication version number.
- Add an audit log for medication and pathway use.
- Add an administrator-only pathway editor.
- Add an administrator-only medication editor.
- Display “last reviewed” dates.
- Add a visible “content review required” warning when a guide is overdue for review.
- Provide a printable version without navigation controls.
- Never claim that the guides replace real medical training.

## Acceptance criteria

Codex implementation is complete only when:

1. The RTC pathway loads successfully.
2. The disclaimer is visible on every relevant screen.
3. The user can follow the pathway step by step.
4. Observations can be selected or randomly generated.
5. Deterioration branches work.
6. Medication administration requires confirmation and prerequisite observations.
7. Medication administration is logged.
8. Reassessment is required after treatment.
9. ATMIST handover is generated.
10. The pathway can be printed.
11. Invalid pathway files produce a clear error.
12. Mobile layout works correctly.

````

---

## 2. `data/pathways/trauma/road-traffic-collision.json`

```json
{
  "id": "road-traffic-collision",
  "title": "Road Traffic Collision",
  "short_title": "RTC",
  "category": "Trauma",
  "age_group": "16+",
  "rp_only": true,
  "disclaimer": "REAL MEDICATION INFORMATION — FIVEM ROLE-PLAY ONLY. This content is fictionalised for FiveM gameplay and must not be used to diagnose or treat a real person. In a real emergency, call 999 or 112.",
  "last_reviewed": "2025-02-01",
  "severity": [
    "moderate",
    "serious",
    "critical"
  ],
  "incident_description": "A patient involved in a collision involving a car, van, lorry, motorcycle, bicycle or pedestrian. The mechanism may cause multiple injuries even when external injuries appear minor.",
  "scene_safety": [
    "Confirm that the road or scene is safe before approaching.",
    "Look for moving traffic, leaking fuel, smoke, fire, unstable vehicles, broken glass, electrical hazards and aggressive persons.",
    "Use appropriate personal protective equipment.",
    "Request police, fire and additional medical resources if required.",
    "Identify the number of patients.",
    "Do not enter an unstable vehicle unless there is an immediate life threat or the scene is declared safe.",
    "Consider entrapment and the need for extrication.",
    "Note the estimated speed, direction of impact and visible vehicle damage."
  ],
  "mechanism_questions": [
    "What type of collision occurred?",
    "Was the patient a driver, passenger, motorcyclist, cyclist or pedestrian?",
    "Was the patient wearing a seatbelt or helmet?",
    "Was there airbag deployment?",
    "Was there intrusion into the passenger compartment?",
    "Was the patient thrown from the vehicle?",
    "Was there a rollover?",
    "Was there a second impact?",
    "Was there a death at the scene?",
    "Was the patient trapped or crushed?",
    "Did the patient lose consciousness?",
    "Was there bleeding, vomiting, seizure or confusion?",
    "What time did the collision occur?",
    "What treatment has already been given?"
  ],
  "initial_impression": [
    "Estimate whether this is minor trauma, significant trauma or major trauma.",
    "Observe the patient's position, movement, speech, breathing effort, skin colour and apparent distress.",
    "Look for catastrophic bleeding before beginning a detailed examination.",
    "Assume spinal injury is possible when the mechanism is high energy or the patient has neck pain, neurological symptoms, reduced consciousness or distracting injuries.",
    "Do not allow a patient with possible spinal injury to walk unless directed by a senior clinician or required for immediate scene safety."
  ],
  "primary_survey": {
    "catastrophic_haemorrhage": {
      "look_for": [
        "Pulsatile or heavy external bleeding",
        "Amputation or partial amputation",
        "Large open wounds",
        "Blood pooling in the vehicle",
        "Bleeding from the scalp, chest, abdomen, pelvis or limbs",
        "Clothing soaked with blood"
      ],
      "actions": [
        "Apply firm direct pressure using a dressing.",
        "Use a tourniquet in the RP system for life-threatening limb bleeding not controlled by direct pressure.",
        "Record the time of tourniquet application.",
        "Do not repeatedly remove dressings to inspect the wound.",
        "Escalate immediately if bleeding remains uncontrolled.",
        "Consider major haemorrhage activation for ongoing significant bleeding with abnormal physiology."
      ]
    },
    "airway": {
      "look_for": [
        "Ability to speak in full sentences",
        "Gurgling, snoring or stridor",
        "Blood, vomit or foreign material in the mouth",
        "Facial trauma",
        "Reduced consciousness",
        "Burns or swelling around the mouth"
      ],
      "actions": [
        "Ask a conscious patient to speak.",
        "Maintain manual in-line spinal protection if spinal injury is suspected.",
        "Use basic airway manoeuvres and suction according to the server's permitted role-play procedures.",
        "Escalate immediately for threatened or obstructed airway.",
        "Do not give oral medication or fluids to a patient with reduced consciousness or a threatened airway."
      ]
    },
    "breathing": {
      "look_for": [
        "Respiratory rate and effort",
        "Chest asymmetry",
        "Reduced air entry",
        "Open chest wound",
        "Cyanosis",
        "Severe chest pain",
        "Tracheal deviation-type presentation",
        "Distended neck veins",
        "Worsening hypoxia",
        "Paradoxical chest movement"
      ],
      "actions": [
        "Expose the chest sufficiently to assess movement and wounds while preventing heat loss.",
        "Apply an occlusive dressing to an open chest wound according to the server's equipment system.",
        "Escalate urgently for severe respiratory distress, worsening oxygen saturation or suspected tension-pneumothorax-type presentation.",
        "Do not delay transport for a prolonged examination.",
        "Record oxygen therapy if administered."
      ]
    },
    "circulation": {
      "look_for": [
        "Heart rate",
        "Blood pressure",
        "Capillary refill",
        "Skin colour and temperature",
        "Weak or absent peripheral pulses",
        "Pelvic pain or instability-type symptoms",
        "Abdominal pain, distension or bruising",
        "Thigh deformity or swelling",
        "Ongoing blood loss",
        "Confusion or agitation"
      ],
      "actions": [
        "Control external haemorrhage.",
        "Obtain intravenous access in the RP system if the character is authorised to do so.",
        "Keep the patient warm.",
        "Do not repeatedly rock or test the pelvis.",
        "Apply a pelvic binder in the RP system only when a high-energy mechanism and suspected pelvic bleeding are present.",
        "Escalate for shock, ongoing bleeding or deteriorating observations."
      ]
    },
    "disability": {
      "look_for": [
        "Glasgow Coma Scale",
        "Pupil size and reactivity",
        "Confusion or agitation",
        "Loss of consciousness",
        "Seizure",
        "Weakness",
        "Numbness",
        "Loss of movement",
        "Severe headache",
        "Vomiting",
        "Blood glucose where clinically relevant"
      ],
      "actions": [
        "Record GCS using eye, verbal and motor components where possible.",
        "Repeat neurological observations if the patient has a head injury or abnormal consciousness.",
        "Treat deteriorating consciousness as a time-critical problem.",
        "Do not assume intoxication explains an abnormal mental state until significant injury has been considered.",
        "Escalate for GCS below 15, new neurological deficit, seizure or deterioration."
      ]
    },
    "exposure_and_environment": {
      "look_for": [
        "Front and back of the body where safe",
        "Hidden bleeding",
        "Deformity",
        "Bruising from seatbelts",
        "Penetrating injury",
        "Burns",
        "Cold exposure",
        "Wet clothing"
      ],
      "actions": [
        "Expose only as much as required to assess injuries.",
        "Preserve dignity.",
        "Prevent hypothermia using blankets or approved warming equipment.",
        "Record all visible injuries before covering the patient."
      ]
    }
  },
  "observations": {
    "stable_minor_pattern": {
      "heart_rate": "78-100 bpm",
      "respiratory_rate": "12-20/min",
      "blood_pressure": "Normal for the patient",
      "oxygen_saturation": "96-100% on air",
      "gcs": "15",
      "pain_score": "1-5/10",
      "skin": "Warm, normal colour, capillary refill less than 2 seconds"
    },
    "concerning_pattern": {
      "heart_rate": "100-120 bpm",
      "respiratory_rate": "20-28/min",
      "blood_pressure": "Normal or borderline low",
      "oxygen_saturation": "92-95% on air or falling",
      "gcs": "13-15 or confused",
      "pain_score": "6-9/10",
      "skin": "Pale, cool or sweaty; capillary refill may be delayed"
    },
    "critical_pattern": {
      "heart_rate": "120 bpm or higher, or abnormally slow in a deteriorating patient",
      "respiratory_rate": "Below 8, above 30 or visibly inadequate",
      "blood_pressure": "Falling or markedly low for the patient",
      "oxygen_saturation": "Below 92% or rapidly falling",
      "gcs": "8 or less, or a clear downward trend",
      "pain_score": "Severe or suddenly worsening",
      "skin": "Mottled, grey, blue, cold or clammy"
    },
    "observation_rules": [
      "A single normal observation set does not exclude serious injury.",
      "Repeat observations after every major intervention and when symptoms change.",
      "Record the trend rather than only the latest value.",
      "Use the overall clinical picture, mechanism and examination findings."
    ]
  },
  "focused_examination": {
    "head_and_face": [
      "Scalp wounds or swelling",
      "Facial deformity",
      "Bleeding from the nose or ears",
      "Loose or missing teeth",
      "Pupil abnormality",
      "Loss of consciousness",
      "Vomiting or seizure"
    ],
    "neck_and_spine": [
      "Neck pain or midline tenderness",
      "Weakness or altered sensation",
      "Loss of movement",
      "Spinal deformity",
      "Tingling in the limbs",
      "New bladder or bowel symptoms where relevant"
    ],
    "chest": [
      "Chest pain",
      "Chest-wall tenderness",
      "Unequal movement",
      "Open wound",
      "Reduced air entry",
      "Crepitus-type finding",
      "Increasing respiratory effort"
    ],
    "abdomen_and_pelvis": [
      "Abdominal pain",
      "Distension",
      "Guarding or rigidity-type presentation",
      "Seatbelt bruising",
      "Pelvic pain",
      "Pain on movement",
      "Blood at the urethral opening or genital injury"
    ],
    "limbs": [
      "Deformity",
      "Shortening or abnormal rotation",
      "Swelling",
      "Open wounds",
      "Bleeding",
      "Reduced movement",
      "Altered sensation",
      "Weak or absent distal pulse",
      "Pale or cold limb"
    ]
  },
  "differential_diagnoses": [
    "Minor soft-tissue injury",
    "Closed fracture",
    "Open fracture",
    "Dislocation",
    "Head injury or concussion",
    "Intracranial bleeding",
    "Cervical spine injury",
    "Chest injury",
    "Pneumothorax-type presentation",
    "Haemothorax-type presentation",
    "Cardiac or major-vessel injury",
    "Abdominal organ injury",
    "Pelvic fracture",
    "Internal haemorrhage",
    "Traumatic shock",
    "Spinal cord injury",
    "Crush injury",
    "Drug or alcohol intoxication complicating trauma"
  ],
  "likely_rp_diagnoses": {
    "minor": [
      "Superficial cuts or grazes",
      "Bruising",
      "Minor soft-tissue injury",
      "Low-grade sprain"
    ],
    "moderate": [
      "Closed limb fracture",
      "Dislocation",
      "Concussion with normal GCS",
      "Moderate chest-wall injury",
      "Deep laceration without shock"
    ],
    "serious": [
      "Open fracture",
      "Multiple fractures",
      "Significant head injury",
      "Chest injury with respiratory compromise",
      "Suspected internal bleeding",
      "Pelvic injury",
      "Spinal injury"
    ],
    "critical": [
      "Uncontrolled catastrophic haemorrhage",
      "Severe traumatic shock",
      "Airway obstruction",
      "Severe respiratory failure",
      "Cardiac arrest",
      "GCS 8 or less",
      "Suspected major internal haemorrhage",
      "Tension-pneumothorax-type presentation"
    ]
  },
  "immediate_management": [
    "Use the &lt;C&gt;ABCDE sequence.",
    "Control catastrophic haemorrhage first.",
    "Maintain spinal protection when clinically indicated.",
    "Administer oxygen only according to the server's oxygen-treatment rules and documented indication.",
    "Establish monitoring and repeat observations.",
    "Treat immediately life-threatening problems before minor injuries.",
    "Immobilise suspected fractures in the position found unless the server's authorised protocol permits otherwise.",
    "Do not repeatedly manipulate suspected spinal, pelvic or limb injuries.",
    "Keep the patient warm.",
    "Minimise time at scene once immediate life-saving interventions are complete.",
    "Pre-alert the receiving hospital for serious or critical trauma.",
    "Transport major trauma to the server's designated major trauma centre."
  ],
  "medications": [
    {
      "id": "morphine-sulfate-iv",
      "name": "Morphine sulfate",
      "indication": "Severe traumatic pain after the primary survey, provided there is no contraindication.",
      "adult_rp_dose": "1-10 mg intravenously over 4-5 minutes; titrate to response. Do not exceed 15 mg as the initial loading dose.",
      "repeat_rule": "Only repeat after reassessment of pain, respiratory rate, oxygen saturation, blood pressure and sedation. Do not automatically repeat.",
      "route": "Intravenous",
      "rp_only_warning": "RP-ONLY DOSE — NOT FOR REAL-WORLD USE",
      "do_not_give_if": [
        "Respiratory depression",
        "Reduced consciousness or coma",
        "Suspected raised intracranial pressure or significant head injury unless authorised by a senior clinician",
        "Acute asthma attack or severe obstructive airway disease",
        "Acute alcohol intoxication",
        "Known morphine or opioid allergy",
        "Severe or acute liver failure",
        "Moderate to severe renal impairment",
        "Recent monoamine oxidase inhibitor use",
        "Uncorrected severe hypotension or shock without senior authorisation"
      ],
      "cautions": [
        "Older or frail patient",
        "Hypotension",
        "Shock",
        "Pregnancy",
        "Breastfeeding",
        "Concurrent benzodiazepines, sedatives or alcohol",
        "History of opioid dependence or opioid tolerance"
      ],
      "monitoring": [
        "Respiratory rate",
        "Oxygen saturation",
        "Consciousness and sedation",
        "Blood pressure",
        "Heart rate",
        "Pain score"
      ],
      "senior_authorisation_required": true
    },
    {
      "id": "tranexamic-acid-iv-trauma",
      "name": "Tranexamic acid",
      "indication": "Major trauma with active or suspected major bleeding, given as soon as possible and within 3 hours of injury.",
      "adult_rp_dose": "1 g intravenously over 10 minutes, followed by 1 g by intravenous infusion over 8 hours, according to the server's major-haemorrhage protocol.",
      "route": "Intravenous",
      "rp_only_warning": "RP-ONLY DOSE — NOT FOR REAL-WORLD USE",
      "do_not_give_if": [
        "More than 3 hours since injury unless a senior clinician documents a specific indication",
        "Known hypersensitivity",
        "Acute venous or arterial thrombosis",
        "History of seizures unless senior clinician authorises",
        "Severe renal impairment unless the server protocol provides a renal-adjusted dose"
      ],
      "cautions": [
        "History of seizures",
        "Severe renal impairment",
        "Known thromboembolic disease",
        "Suspected disseminated intravascular coagulation"
      ],
      "monitoring": [
        "Heart rate",
        "Blood pressure",
        "Mental state",
        "Ongoing bleeding",
        "Response to haemorrhage management"
      ],
      "senior_authorisation_required": true
    }
  ],
  "reassessment": {
    "after_initial_assessment": [
      "Repeat the full primary survey.",
      "Repeat observations.",
      "Repeat pain score.",
      "Repeat GCS and pupils if head injury is possible.",
      "Repeat distal circulation, sensation and movement for limb injuries."
    ],
    "after_medication": [
      "Reassess within the server's configured medication interval.",
      "Document response and adverse effects.",
      "Do not administer further opioid if respiratory rate falls, consciousness deteriorates or oxygen saturation falls."
    ],
    "during_transport": [
      "Repeat observations at regular intervals.",
      "Repeat immediately after deterioration.",
      "Record the trend in the patient record.",
      "Update the receiving hospital if the patient's condition changes."
    ]
  },
  "escalation_criteria": [
    "Catastrophic bleeding",
    "Ongoing bleeding despite direct pressure or tourniquet",
    "Suspected major haemorrhage",
    "Abnormal or deteriorating vital signs",
    "GCS below 15 or falling GCS",
    "Seizure",
    "New weakness, numbness or paralysis",
    "Severe chest pain or respiratory distress",
    "Oxygen saturation falling despite appropriate support",
    "Suspected pelvic fracture with shock",
    "Open fracture",
    "Absent distal pulse",
    "Gross deformity",
    "Suspected spinal injury",
    "Suspected internal bleeding",
    "Patient trapped or crushed",
    "Death or serious injury at the scene",
    "High-speed, rollover or ejection mechanism"
  ],
  "disposition": {
    "minor": [
      "Only consider minor disposition if the patient has a reassuring examination, normal observations, no red flags and no significant mechanism.",
      "Provide a clear RP safety-netting instruction and documentation."
    ],
    "moderate": [
      "Transport to the designated emergency department for further assessment and imaging.",
      "Repeat observations during transport."
    ],
    "serious_or_critical": [
      "Pre-alert the designated major trauma centre.",
      "Use the shortest safe route.",
      "Provide only immediate life-saving interventions at scene.",
      "Request senior clinician or specialist backup."
    ]
  },
  "handover": {
    "format": "ATMIST",
    "template": "This is a [age]-year-old [sex] involved in a [type of collision] at [time]. The mechanism was [mechanism]. Suspected injuries are [injuries]. Initial observations were HR [value], RR [value], BP [value], SpO2 [value], GCS [value] and pain [value]/10. Findings include [key positives] and [key negatives]. Treatment given was [treatment and medication]. The response was [response]. Estimated arrival is [time]. Additional requirements are [requirements].",
    "example": "This is a 32-year-old following a high-speed car collision at 14:20. The patient was the restrained driver and required extrication. Suspected injuries are chest trauma and a left femur fracture. Initial observations are pulse 118, respiratory rate 26, blood pressure 102/68, oxygen saturation 95% on air, GCS 15 and pain 9/10. There is left thigh deformity and controlled bleeding, with no obvious airway obstruction. Morphine was administered under the RP medication protocol and the patient remains borderline but responsive. ETA is 10 minutes. Major-trauma reception is requested."
  },
  "documentation": [
    "Time of incident",
    "Time of first patient contact",
    "Mechanism and collision details",
    "Patient position and need for extrication",
    "Scene hazards",
    "Primary survey findings",
    "Initial and repeat observations",
    "GCS and pupil findings",
    "All injuries identified",
    "Bleeding-control methods and times",
    "Spinal or pelvic precautions",
    "Medication name, dose, route, time and response",
    "Allergies and relevant medical history",
    "Pre-alert time and recipient",
    "Destination",
    "Final handover"
  ],
  "complications": [
    "Occult internal haemorrhage",
    "Traumatic shock",
    "Airway obstruction",
    "Respiratory failure",
    "Pneumothorax-type presentation",
    "Intracranial bleeding",
    "Spinal cord injury",
    "Compartment-syndrome-type deterioration",
    "Hypothermia",
    "Medication-induced respiratory depression"
  ],
  "example_cases": [
    {
      "id": "rtc-mild",
      "description": "Low-speed rear-end collision. Patient is alert, walking, has neck stiffness and superficial bruising only.",
      "observations": {
        "heart_rate": 92,
        "respiratory_rate": 16,
        "blood_pressure": "136/82",
        "oxygen_saturation": 99,
        "gcs": 15,
        "pain_score": 4
      },
      "likely_diagnosis": "Minor soft-tissue injury with possible neck strain",
      "red_flags": [
        "Midline cervical tenderness",
        "Neurological symptoms",
        "Loss of consciousness",
        "Worsening headache",
        "Vomiting"
      ]
    },
    {
      "id": "rtc-moderate",
      "description": "Side-impact collision. Patient has left forearm deformity, severe pain and bruising but remains alert.",
      "observations": {
        "heart_rate": 108,
        "respiratory_rate": 22,
        "blood_pressure": "118/74",
        "oxygen_saturation": 97,
        "gcs": 15,
        "pain_score": 8
      },
      "likely_diagnosis": "Suspected closed forearm fracture",
      "red_flags": [
        "Open wound",
        "Absent distal pulse",
        "Altered sensation",
        "Increasing pain after immobilisation"
      ]
    },
    {
      "id": "rtc-critical",
      "description": "High-speed rollover with prolonged extrication. Patient is pale, confused, tachycardic and has abdominal tenderness with ongoing external bleeding.",
      "observations": {
        "heart_rate": 132,
        "respiratory_rate": 30,
        "blood_pressure": "84/52",
        "oxygen_saturation": 92,
        "gcs": 12,
        "pain_score": 10
      },
      "likely_diagnosis": "Major trauma with suspected haemorrhagic shock and multiple injuries",
      "red_flags": [
        "Falling blood pressure",
        "Altered mental state",
        "Ongoing bleeding",
        "Abdominal tenderness",
        "High-energy mechanism"
      ]
    }
  ],
  "sources": [
    {
      "title": "NICE: Major trauma: assessment and initial management",
      "url": "https://www.nice.org.uk/guidance/ng39/chapter/recommendations"
    },
    {
      "title": "Morphine sulfate 1 mg in 1 ml solution for injection — MHRA Summary of Product Characteristics",
      "url": "https://mhraproducts4853.blob.core.windows.net/docs/4bae43d632c68ff32aa2f8ad18092dbd4b119716"
    },
    {
      "title": "NICE: Major trauma: service delivery",
      "url": "https://www.nice.org.uk/guidance/ng40/chapter/recommendations"
    }
  ]
}

````

The RTC guide follows NICE’s `&lt;C&gt;ABCDE` major-trauma approach, direct pressure for external bleeding, tourniquet use for uncontrolled life-threatening limb haemorrhage, early tranexamic acid consideration, regular pain assessment and escalation to a major trauma centre. [1]          &#x20;

The morphine entry uses the MHRA product information dose range of **1–10 mg IV over 4–5 minutes, maximum 15 mg as an initial loading dose**, with close monitoring for pain, sedation and respiratory rate. [2]          &#x20;

For the trauma TXA regimen used in the example file, configure it to your server’s approved major-haemorrhage protocol and review it before publication. NICE recommends giving IV tranexamic acid as soon as possible in major trauma with active or suspected active bleeding and not routinely after 3 hours. [1]          &#x20;

### References

1. [Major trauma: assessment and initial management](https://www.nice.org.uk/guidance/ng39/chapter/recommendations)                                                                                                                         &#x20;

   www\.nice.org.uk › ... › ng39 › chapter › recommendations
2. [MORPHINE SULFATE 1MG IN 1ML SOLUTION FOR INJECTION.](https://mhraproducts4853.blob.core.windows.net/docs/4bae43d632c68ff32aa2f8ad18092dbd4b119716)                                                                                                                         &#x20;

   mhra.gov.uk > ... > Summary of product characteristics > spc-doc_PL 13079-0001.pdf

   Active substances: MORPHINE SULFATE, last read 2026-09-28