# Citation Integrity Protocol

## Verification steps (every reference)

1. Search: `"[first author] [year] [distinctive phrase]"` or `doi:[doi]`
2. Confirm: full author list, title, venue, year, volume/pages if applicable, DOI
3. Check status: peer-reviewed journal/conference vs preprint server vs grey literature
4. Optional retraction: search `"[title] retraction"` or Retraction Watch database
5. Write to `references.bib` only after step 2 passes

## Red flags — exclude or flag

| Signal | Action |
|--------|--------|
| Predatory publisher (Beall's list, journalquality.info) | Exclude |
| No peer review, no affiliation | Exclude |
| Cannot verify DOI/title match | `[UNVERIFIED]` — never in final bib |
| Retracted | Remove or cite retraction notice explicitly |
| Citation ring / excessive self-citation of one lab | Note in related work |

## Paywalled access ladder

1. Unpaywall / Semantic Scholar open access link
2. arXiv / PMC / author institutional repository
3. Abstract-only — cite with limitation note, do not invent methods/results
4. Ask user to provide PDF if critical

## Claim-evidence rules

| Claim type | Required support |
|------------|------------------|
| Prior work fact | Citation to primary source |
| Comparative statement ("X outperforms Y") | Citation or your Table/Figure |
| Novel contribution | Your Methods/Results |
| Future direction | Clearly labeled as speculation |

## Source log minimum fields

`citation_key`, `title`, `authors`, `year`, `venue`, `status`, `doi_or_url`, `date_checked`, `takeaway`, `used_in_sections`
