# CIN reference codes — source notes (v2)

This README contains the evidence and methodology for `cin_reference_codes_v2.csv`. The CSV is intentionally page-facing and contains **no source URLs**.

## CSV schema

- `code`: exact code/token.
- `meaning`: decoded meaning.
- `type`: one of `listing`, `state`, or `company_type`. The parser must use this field; do not infer the code family from string length.
- `status`: one of `current`, `legacy`, `alias`, or `observed`.
- `notes`: caveat or implementation guidance.

## Status semantics for the parser

- `current`: supported as a current CIN token by the documented reference set or corroborating CIN records.
- `legacy`: historical CIN token; accept only if the checker is designed to support historical CINs, and label it as legacy.
- `alias`: an official/statistical geography abbreviation, but not established as the corresponding token in CINs. **Do not accept aliases as CIN state tokens by default.**
- `observed`: appears in a published CIN record or the supplied company-master extract, but the evidence is exceptional or secondary. Keep it visible and label it as observed; do not silently elevate it to a fully authoritative code.

A structurally valid CIN is not proof that the CIN is currently registered, active, or listed. This file only supports structural decoding.

## Findings on disputed state codes

### Chhattisgarh: `CT` in CINs; `CG` is a geography alias

The Chhattisgarh State Power Distribution Company Limited publishes its CIN as `U40108CT2003SGC015822` on its official website. An MCA-published STK-7 list also contains multiple Chhattisgarh CINs using `CT` (for example, `U22120CT2014PTC001277`). Separately, an MCA state-abbreviation table uses `CG` for Chhattisgarh. These are different contexts: keep `CG` in the reference data as `type=state,status=alias`, but the CIN parser should accept `CT`, not `CG`, for the CIN state segment unless an actual CIN with `CG` is independently verified.

### Uttarakhand: both `UR` and `UT` occur in CIN records

The user-provided Uttarakhand company-master extract contains 24,212 records. Of those, the two-character CIN segment at positions 7–8 is:

| Segment | Rows | Evidence in extract |
|---|---:|---|
| `UR` | 13,381 | Many records, with registration dates through 2023-01-20 |
| `UT` | 6,729 | Many records, including registrations through 2026-08-05 |
| `UW` | 1 | One active 1998 record for Genus Innovation Limited |

The same extract also contains 7 `UP`, 1 `DL`, and 11 blank/other segment cases. Those are not treated as Uttarakhand CIN tokens merely because the export is state-filtered; the registered company/ROC jurisdiction can differ from a registered-office state filter.

An official Uttarakhand Power Corporation document shows its CIN as `U40109UR2001SGC025867`, independently corroborating `UR`. The recent `UT` entries are directly present in the supplied extract and are also visible on secondary company-listing pages. Therefore, the dataset keeps both `UR` and `UT` as `current` tokens. `UK` remains an `alias` because it appears in MCA state-abbreviation tables, but the supplied CIN extract did not show `UK` in the CIN segment.

`UW` is kept as `observed`, not as an ordinary current code: only one row in the supplied extract has this token. Secondary listings for Genus Innovation repeat it, but it should be checked against the authoritative MCA record before treating it as generally valid.

## Sources

### Primary / government sources

1. **Chhattisgarh State Power Distribution Company Limited — official company profile.** Shows the company's CIN as `U40108CT2003SGC015822`, with the state segment `CT`.
   - https://www.cspdcl.co.in/cseb/frmCompanyProfile.aspx
2. **Ministry of Corporate Affairs — Form STK-7, Chhattisgarh.** Official MCA document containing several CIN examples with `CT`.
   - https://www.mca.gov.in/Ministry/pdf/STK7Chattisgarh_24102019.pdf
3. **Ministry of Corporate Affairs — Overview of the Corporate Sector, Table 17: List of State Abbreviations.** Shows `CG` for Chhattisgarh and `UK` for Uttarakhand, and also includes `OD`, `TS`, `DH`, and `LA` as statistical state abbreviations. This is a state-abbreviation list, not a definitive CIN-token list. The MCA uses a tokenised document-download URL that may change; find the report by its title on the MCA website if the direct link expires.
   - https://www.mca.gov.in/bin/dms/getdocument?mds=txTYdsRdDC%252BtNEfohyF1SQ%253D%253D&type=open
   - MCA Company Master Details portal: https://www.mcacdm.nic.in/company-master-details.php
4. **Uttarakhand Power Corporation Limited — official document.** Displays CIN `U40109UR2001SGC025867`, corroborating `UR`.
   - https://cdnbbsr.s3waas.gov.in/s303412aef4dcdee4f934f7bf599f89783/uploads/2025/08/202508251474101998.pdf
5. **ASI Instruction Manual 2016–17, Directorate of Economics & Statistics, Chhattisgarh.** Describes the 21-character CIN positions and gives the ownership-code meanings including GOI, SGC, PLC, PTC, FLC, FTC, ULL, ULT, GAP, GAT, and NPL.
   - https://descg.gov.in/pdf/asi/manual/ASI_Instruction_Manual_2016-17.PDF
6. **MCA — One Person Company FAQ.** Government source for the OPC category.
   - https://www.mca.gov.in/content/mca/global/en/help-faq/faqs/company-services/incorporation/one-person-company.html

### User-provided data extract

7. **Uttarakhand company-master CSV supplied in this conversation.** File had 24,212 rows, `CompanyStateCode=uttarakhand`, and registration dates extending to 2026-08-05. Inspection of the CIN state segment produced the counts above. Its exact original download URL/provenance was not recorded with the file, so this is described as a supplied extract rather than independently attributed to MCA.

### Secondary / observed-only sources

8. **ZaubaCorp — state/ROC company listings.** Used only to corroborate observed tokens such as `TG`, `DN`, `LH`, and recently published `UT` examples. Treat as secondary evidence, not an official code specification.
   - https://www.zaubacorp.com/companies-list/state-TELANGANA/listed-Unlisted/status-Active/roc-RoC-Hyderabad-company.html
   - https://www.zaubacorp.com/companies-list/roc-RoC-Uttarakhand-company.html
   - https://www.zaubacorp.com/companies-list/state-LADAKH-company.html
   - https://www.zaubacorp.com/companies-UT-40
9. **Olaw / IndiaFilings — Nidhi examples.** Used only as secondary evidence for `PLN`; not authority for a comprehensive ownership-code list.
   - https://olaw.in/company-incorporation/unak-india-nidhi-limited-u64990kl2023pln081165
   - https://www.indiafilings.com/search/trimurti-urban-multiple-nidhi-limited-cin-U65999PN2021PLN201657

## Implementation recommendation

1. Parse the CIN's positions first, then use `type` to choose the correct lookup family.
2. Look up exact code + type. Never guess the lookup family by code length.
3. For `alias`, show a clear message such as **“Recognised geography abbreviation; not accepted as a CIN state token.”**
4. For `legacy`, show the decoded meaning with a **Legacy code** label.
5. For `observed`, show **Observed in records — verify against MCA** rather than presenting it as an official/current specification.
6. Do not use the `meaning` for year decoding: the four-digit incorporation year is read directly from CIN positions 9–12.
7. Do not label `L` as proof of current stock-exchange listing, and do not label `U` as proof that the company is currently active.
