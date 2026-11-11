# Standards mapping: HL7 FHIR R4, ISBT 128 and DHIS2

How our data model (`docs/data-model.md`) would map to three standards.

**Nothing in this file is implemented in code today.** There is no FHIR export, no ISBT 128 label and no DHIS2 export. Every row carries one of three labels:

| Label | Meaning |
|---|---|
| implemented | Works in the running system |
| mapped on paper | We read the standard and wrote the mapping down. Not built. |
| future | Needs more design, or the standard has no matching element |

FHIR resource and field names below were checked on the official HL7 FHIR R4 pages listed at the end. Where a page did not show something, this file says so.

## 1. FHIR R4: resource level

| Our entity | FHIR R4 resource | Label | Note |
|---|---|---|---|
| EmergencyRequest | ServiceRequest | mapped on paper | Details in section 2 |
| Dispatch | Task | mapped on paper | `Task.focus` points at the ServiceRequest, `Task.owner` is the supplying organisation |
| Blood unit (`units` table) | BiologicallyDerivedProduct | mapped on paper | Several gaps. See section 3. |
| UnitHold | none | future | An internal reservation. The nearest fit is `BiologicallyDerivedProduct.status`, which has only `available` and `unavailable`. |
| RankedOption | none | future | A recommendation for the officer. Kept inside the system. |
| Facility (`facilities` table) | Location, with Organization | mapped on paper | See the table below |
| Fridge and cool-box temperature | Observation | mapped on paper | `Observation.subject` may be a Device or a Location, so no Patient is needed |
| AuditEvent (ours) | AuditEvent | mapped on paper | See the table below |
| Officer or approval step | Provenance | future | Records who did what to which resource |
| StaffProfile | PractitionerRole | mapped on paper | Links a person to an organisation, a role code and locations |

There is deliberately no Patient resource in this mapping. Supplying sites never see patient data, so the request points at the requesting hospital (a Location) and not at a patient.

### Facility to Location and Organization

| Our field | FHIR element | Label |
|---|---|---|
| `facility_id` | `Location.identifier`, `Organization.identifier` | mapped on paper |
| `name` | `Location.name`, `Organization.name` | mapped on paper |
| `lat`, `lon` | `Location.position.latitude`, `Location.position.longitude` | mapped on paper |
| `county` | `Location.address` | mapped on paper |
| `facility_type` | `Location.type`, `Organization.type` | mapped on paper (code system to choose) |
| `supply_centre_id` | `Location.partOf` or `Organization.partOf` | mapped on paper |
| `grid_reliability`, `connectivity`, `has_blood_fridge_backup_power` | no element on the Location page | future (would need an extension) |

### Our AuditEvent to FHIR AuditEvent

| Our field | FHIR element | Label |
|---|---|---|
| `created_at` | `AuditEvent.recorded` (1..1) | mapped on paper |
| `actor`, `actor_username` | `AuditEvent.agent.who`, `AuditEvent.agent.name` | mapped on paper |
| `actor_role` | `AuditEvent.agent.role` | mapped on paper |
| `action`, `object_type` | `AuditEvent.type`, `AuditEvent.subtype` | mapped on paper (codes to choose) |
| `object_type` plus `object_id` | `AuditEvent.entity.what` | mapped on paper |
| `reason` | `AuditEvent.purposeOfEvent` or `AuditEvent.outcomeDesc` | mapped on paper |
| `before`, `after` | `AuditEvent.entity.detail` (type and value) | future |

## 2. FHIR R4: ServiceRequest (our EmergencyRequest)

| Our field | ServiceRequest element | Label | Note |
|---|---|---|---|
| `id` | `identifier` | mapped on paper | |
| `client_request_id` | `identifier` (a second one) | mapped on paper | Our idempotency key |
| `created_at` | `authoredOn` | mapped on paper | |
| fixed | `intent` = `order` | mapped on paper | `order` is a listed value |
| `status` | `status` | mapped on paper | See the status table below |
| `urgency` | `priority` | mapped on paper | `life_threatening` to `stat`, `urgent` to `urgent`, `routine` to `routine`. All four values `routine`, `urgent`, `asap`, `stat` are listed on the page. |
| `component` (RBC, PLT, FFP) | `code` | future | The page binds `code` to SNOMED CT procedure codes. Blood component codes would come from elsewhere. |
| `units_requested` | `quantity[x]` as Quantity | mapped on paper | |
| `requesting_facility_id` | `subject` as a Location, plus `requester` as an Organization | mapped on paper | `subject` is required (1..1) and may be a Patient, Group, Location or Device. We use the Location so no Patient is needed. |
| `raised_by` | `requester` as a PractitionerRole | mapped on paper | |
| supplying site (from Dispatch) | `performer` as an Organization | mapped on paper | |
| `clinical_note` | `note` | future | Only the blood bank may see it, so access labels are needed first |
| ETA low and high | `occurrencePeriod` (start and end) | future | The element means when the service should happen, so this is a loose fit |
| `patient_blood_group` | no ServiceRequest element | future | Patient data. Would need a Patient and an Observation, which we do not create. |
| `authorisation_route` | none | future | Needs an extension, or a Task |
| `warnings`, `compatible_groups` | none | future | Internal decision support |

**Status mapping (our 12 values to ServiceRequest.status).** The listed values are `draft`, `active`, `on-hold`, `revoked`, `completed`, `entered-in-error`, `unknown`.

| Our status | ServiceRequest.status | Label |
|---|---|---|
| DraftFromCall | `draft` | mapped on paper |
| Raised, Matching, UnitsHeld, AwaitingDecision, Escalated, AwaitingAuthorisation, SentToSupplier, Dispatched, InTransit | `active` | mapped on paper |
| Received | `completed` | mapped on paper |
| HandledManually | no clean fit | future (see open questions) |

The detailed stage would travel in `Task.businessStatus`, which exists as an optional CodeableConcept on Task.

## 3. FHIR R4: BiologicallyDerivedProduct (our blood unit)

The resource has "Trial Use" maturity on its page. It has **no element for expiry date and none for blood group**. Both are gaps.

| Our field | BiologicallyDerivedProduct element | Label | Note |
|---|---|---|---|
| `unit_id` | `identifier` | mapped on paper | Not an ISBT 128 number. See section 4. |
| `component` | `productCode` | future | The page shows no binding for `productCode` |
| `component` (category) | `productCategory` | future | Allowed values: organ, tissue, fluid, cells, biologicalAgent. Which one fits red cells and plasma is a judgement we have not settled. |
| `status` | `status` | mapped on paper | Only `available` and `unavailable`. `in_stock` to `available`. `transfused`, `expired` and `discarded_temperature` to `unavailable`, which loses detail. |
| `collection_date` | `collection.collectedDateTime` | mapped on paper | |
| `expiry_date` | no element | future | Would need an extension |
| `blood_group` | no element | future | Would need an Observation or an extension |
| `temp_excursion_exposed` | no element | future | `storage.temperature` and `storage.scale` (celsius) exist, but they describe storage, not a quarantine flag |
| `current_facility_id` | no element | future | The resource has no location element |
| `donation_id` | none | future | `collection.source` takes a Patient or Organization, and we do not model donors as Patients |
| link to the request it serves | `request` (Reference to ServiceRequest) | mapped on paper | |

## 4. ISBT 128

All rows are **future**.

**Our unit ids look like `U2610-NBO-053854-RBC`. They are not ISBT 128 Donation Identification Numbers.** The ISBT 128 page for the Donation Identification Number describes a 13-character donation number element. Our ids have a different shape.

| Concept | Our field | Label |
|---|---|---|
| Donation Identification Number | `unit_id`, `donation_id` | future |
| Product code | `component` | future |
| ABO and RhD group | `blood_group` | future |
| Expiry date | `expiry_date` | future |
| Printed barcode label | none | future |

The exact ISBT 128 codes and data structures for product, group and expiry were not checked here.

## 5. DHIS2

All rows are **mapped on paper**. The DHIS2 documentation says aggregate data is described by an organisation unit (where), a data element with category combinations (what) and a period (when), and that an organisation unit must be assigned to a data set before it can collect data.

| Our data | DHIS2 concept | Label |
|---|---|---|
| 47 facilities | Organisation units | mapped on paper |
| Daily stock by facility, component and blood group (`daily_stock`) | A data element for units in stock, with a category combination of component and blood group, reported per day | mapped on paper |
| Requests by urgency and outcome (`requests`) | Data elements with a category combination of urgency and outcome | mapped on paper |
| Emergency delivery times | A data element for median hours, per organisation unit and period | mapped on paper |
| Reporting forms for each facility | A data set assigned to each organisation unit | mapped on paper |
| The export job itself | none | future |

## 6. Open questions and what we did not verify

- **HandledManually.** It means "a person finishes this by phone". `revoked` says the request was withdrawn, which is wrong for a request that was handled. We have not chosen a mapping.
- **Task status codes.** The page text we read shows `draft | requested | received | accepted | +` and was cut off. We have not checked the rest of the list, so a Dispatch status mapping (AwaitingRelease, Released, InTransit, Received, Declined, Cancelled) is not written here.
- **AuditEvent codes.** The page names value sets for `action` and `outcome` but we did not read the code values.
- **Blood component codes.** `ServiceRequest.code` is bound to SNOMED CT procedure codes. We did not look for a blood product code system.
- **Location as the subject.** The spec allows a Location as `subject`. We did not check whether other systems expect it.
- **productCategory** for red cells and plasma, and the `productCode` binding, are open.
- **Access control.** FHIR security labels (to hide the clinical note from suppliers) were not checked.
- **ISBT 128.** The Donation Identification Number page confirms a 13-character element. A split into facility (5), year (2) and serial (6), and two flag characters, appeared in search summaries of ICCBBA documents but not on the page we fetched. The product code, group and expiry structures were not checked at all.
- **DHIS2.** We read documentation pages from several versions through search and one current page. We did not check the aggregate data value API or the organisation unit hierarchy.
- **Partial page reads.** The larger FHIR pages were read through their element tables. Text after roughly the first 100,000 characters of ServiceRequest, Location, Task, AuditEvent and Observation was not read.

## 7. Sources checked

- https://hl7.org/fhir/R4/servicerequest.html
- https://hl7.org/fhir/R4/biologicallyderivedproduct.html
- https://hl7.org/fhir/R4/location.html
- https://hl7.org/fhir/R4/organization.html
- https://hl7.org/fhir/R4/task.html
- https://hl7.org/fhir/R4/observation.html
- https://hl7.org/fhir/R4/auditevent.html
- https://hl7.org/fhir/R4/provenance.html
- https://hl7.org/fhir/R4/practitionerrole.html
- https://www.isbt128.org/uri/donationidentificationnumber/
- https://docs.dhis2.org/en/implement/database-design/aggregate-system-design/data-elements-and-custom-dimensions.html
