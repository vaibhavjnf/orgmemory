export interface RemoteFile {
  externalId: string;
  name: string;
  mimeType: string;
  path: string;
  projectId: string;
  ownerId: string;
  sharedWith: string[];
  authorRole: "employee" | "manager" | "admin" | "agent";
  matterId: string | null;
  createdAt: string;
  modifiedAt: string;
  content: string;
  metadata: Record<string, string>;
}

export const HQ_RENT_SCHEDULE = `EXHIBIT B — RENT SCHEDULE
Premises: Floors 14–16, 400 Montgomery Street, San Francisco
Landlord: Montgomery Plaza LLC    Tenant: Acme Legal LLP

Base Rent (NNN):
  Year 1: $186,400 per month ($48.00 / RSF)
  Year 2: $191,992 per month (3% escalation)
  Year 3: $197,752 per month
  Year 4: $203,684 per month
  Year 5: $209,795 per month

Additional Rent: Tenant's Proportionate Share of Operating Expenses (CAM)
estimated at $14.20 / RSF for the first Lease Year, subject to gross-up.

Abatement: Months 1–2 of Year 1 Base Rent abated, provided Tenant is not in default.

Payment: Due on the first calendar day of each month, without notice or demand,
to Landlord's lockbox. Late fee 5% after the fifth day.

This Exhibit B is the executed rent schedule. Do not draft from the term sheet.`;

export const WAREHOUSE_AMENDMENT = `AMENDMENT NO. 2 TO INDUSTRIAL LEASE — WAREHOUSE 12
Rent escalation: commencing 1 July 2025, Base Rent increases by CPI-U, capped
at 4% per annum, never less than 1.5%. Percentage rent does not apply.

The original rent schedule in Exhibit B of the Warehouse 12 lease remains in
force except as modified herein. Security deposit unchanged.`;

export const LEASE_ABSTRACT_4419 = `CLIENT MATTER 4419 — LEASE ABSTRACT (payment terms)
Property: 88 King Street, Suite 200
Commencement: 1 March 2024
Rent schedule: $42,000 / month Years 1–2; $44,100 / month Years 3–5 (5% bump).
Operating expenses: base year 2024, tenant pays excess.
Renewal: one 5-year option at 95% FMV.
Matter wall: 4419 — do not discuss with the KB-only team.`;

export const SUBLEASE_CHECKLIST = `NYC SUBLEASE CHECKLIST — RENT COMMENCEMENT
1. Confirm over-landlord consent.
2. Align rent commencement with delivery, not execution.
3. Pass through the prime lease rent schedule; do not invent a new curve.
4. Holdover at 150% of the then-current base rent.`;

export const HANDBOOK = `ACME LEGAL EMPLOYEE HANDBOOK 2024
Time off, billing hygiene, and the conflict system. This handbook is not a
lease, does not contain a rent schedule, and is not authority for real-estate
drafting. Partners still expect you to reuse the executed HQ exhibit.`;

export const VENDOR_MSA = `MASTER SERVICES AGREEMENT — CLOUD STORAGE VENDOR
Fees are consumption-based. This MSA is not a real-property lease and has no
rent schedule. Confidentiality and audit rights only.`;

export const OD_MEMO = `PARTNER MEMO (OneDrive) — Rent concessions playbook
When a landlord offers months of abatement, do not silently rewrite Exhibit B.
Document the concession as a rider and keep the original rent schedule intact
so later amendments can cite it.`;

export const DB_NDA = `DROPBOX — MUTUAL NDA TEMPLATE
Standard confidentiality. Unrelated to leasing. Indexed so ranking can reject it.`;

export function googleDriveFiles(): RemoteFile[] {
  return [
    {
      externalId: "gdrive:hq-exhibit-b",
      name: "Acme HQ Office Lease — Exhibit B Rent Schedule.pdf",
      mimeType: "application/pdf",
      path: "/Real Estate/HQ/Acme HQ Office Lease — Exhibit B Rent Schedule.pdf",
      projectId: "proj_re",
      ownerId: "user_priya",
      sharedWith: ["user_jordan", "user_agent"],
      authorRole: "manager",
      matterId: "matter_hq",
      createdAt: "2024-11-02T15:00:00.000Z",
      modifiedAt: "2026-08-20T18:11:00.000Z",
      content: HQ_RENT_SCHEDULE,
      metadata: { executed: "true", exhibit: "B" },
    },
    {
      externalId: "gdrive:wh12-amd2",
      name: "Warehouse 12 Lease Amendment — Rent Escalation.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      path: "/Real Estate/Warehouse 12/Amendment 2.docx",
      projectId: "proj_re",
      ownerId: "user_priya",
      sharedWith: ["user_jordan", "user_agent"],
      authorRole: "manager",
      matterId: "matter_wh12",
      createdAt: "2025-06-01T12:00:00.000Z",
      modifiedAt: "2026-07-02T09:00:00.000Z",
      content: WAREHOUSE_AMENDMENT,
      metadata: { amendment: "2" },
    },
    {
      externalId: "gdrive:4419-abstract",
      name: "Client Matter 4419 — Lease Abstract (payment terms).md",
      mimeType: "text/markdown",
      path: "/Clients/4419/Lease Abstract.md",
      projectId: "proj_client",
      ownerId: "user_priya",
      sharedWith: ["user_jordan", "user_agent"],
      authorRole: "manager",
      matterId: "matter_4419",
      createdAt: "2024-03-12T10:00:00.000Z",
      modifiedAt: "2026-05-14T16:22:00.000Z",
      content: LEASE_ABSTRACT_4419,
      metadata: { matter: "4419" },
    },
    {
      externalId: "gdrive:nyc-sublease",
      name: "NYC Sublease Checklist — Rent Commencement.md",
      mimeType: "text/markdown",
      path: "/Knowledge/Checklists/NYC Sublease Checklist.md",
      projectId: "proj_re",
      ownerId: "user_jordan",
      sharedWith: ["user_priya", "user_agent"],
      authorRole: "employee",
      matterId: null,
      createdAt: "2025-09-01T08:00:00.000Z",
      modifiedAt: "2026-04-01T08:00:00.000Z",
      content: SUBLEASE_CHECKLIST,
      metadata: {},
    },
    {
      externalId: "gdrive:handbook",
      name: "Employee Handbook 2024.pdf",
      mimeType: "application/pdf",
      path: "/HR/Employee Handbook 2024.pdf",
      projectId: "proj_kb",
      ownerId: "user_sam",
      sharedWith: ["user_priya", "user_jordan", "user_agent"],
      authorRole: "employee",
      matterId: null,
      createdAt: "2024-01-15T00:00:00.000Z",
      modifiedAt: "2024-01-15T00:00:00.000Z",
      content: HANDBOOK,
      metadata: {},
    },
    {
      externalId: "gdrive:msa",
      name: "Vendor MSA — Cloud Storage.pdf",
      mimeType: "application/pdf",
      path: "/Vendors/Cloud MSA.pdf",
      projectId: "proj_kb",
      ownerId: "user_priya",
      sharedWith: ["user_sam", "user_agent"],
      authorRole: "manager",
      matterId: null,
      createdAt: "2025-02-01T00:00:00.000Z",
      modifiedAt: "2025-02-01T00:00:00.000Z",
      content: VENDOR_MSA,
      metadata: {},
    },
  ];
}

export function oneDriveFiles(): RemoteFile[] {
  return [
    {
      externalId: "od:rent-concessions",
      name: "Partner memo — rent concessions playbook.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      path: "/OneDrive/Priya/Rent concessions.docx",
      projectId: "proj_re",
      ownerId: "user_priya",
      sharedWith: ["user_jordan", "user_agent"],
      authorRole: "manager",
      matterId: "matter_hq",
      createdAt: "2026-03-01T00:00:00.000Z",
      modifiedAt: "2026-08-01T00:00:00.000Z",
      content: OD_MEMO,
      metadata: { connector: "onedrive" },
    },
  ];
}

export function dropboxFiles(): RemoteFile[] {
  return [
    {
      externalId: "db:nda",
      name: "Mutual NDA template.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      path: "/Dropbox/Templates/Mutual NDA.docx",
      projectId: "proj_kb",
      ownerId: "user_sam",
      sharedWith: ["user_priya", "user_agent"],
      authorRole: "employee",
      matterId: null,
      createdAt: "2023-08-01T00:00:00.000Z",
      modifiedAt: "2023-08-01T00:00:00.000Z",
      content: DB_NDA,
      metadata: { connector: "dropbox" },
    },
  ];
}
