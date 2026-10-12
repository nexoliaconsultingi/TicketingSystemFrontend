import type { ReactNode } from "react"

export type ManualAudience = "all" | "employee" | "supervisor" | "admin"

export type CalloutKind = "note" | "tip" | "important" | "warning"

export type ManualBlock =
  | { type: "p"; children: ReactNode }
  | { type: "callout"; kind: CalloutKind; title?: string; children: ReactNode }
  | { type: "steps"; title?: string; steps: ReactNode[] }
  | { type: "list"; items: ReactNode[] }
  | { type: "table"; columns: string[]; rows: ReactNode[][] }

export interface ManualSection {
  id: string
  title: string
  blocks: ManualBlock[]
}

export interface ManualChapter {
  id: string
  title: string
  audience: ManualAudience
  intro?: string
  sections: ManualSection[]
}

export const AUDIENCE_LABELS: Record<ManualAudience, string> = {
  all: "For everyone",
  employee: "Employees",
  supervisor: "Supervisors",
  admin: "Administrators",
}

export const MANUAL_CHAPTERS: ManualChapter[] = [
  {
    id: "getting-started",
    title: "Getting started",
    audience: "all",
    intro:
      "This chapter applies to every profile. It explains how to sign in, how to find your way around the platform, and the two things every user keeps an eye on: notifications and counters.",
    sections: [
      {
        id: "sign-in",
        title: "Sign in",
        blocks: [
          {
            type: "p",
            children:
              "Accounts are created by the administrator. You receive your email address and a first password, then you confirm your identity with a verification code every time you sign in.",
          },
          {
            type: "steps",
            title: "To sign in",
            steps: [
              "Open the application at the address provided by your administrator (the login screen shows the company name and logo).",
              "Type your **email address** and **password**. Tick **Remember me** to keep your session longer, or leave it unticked on a shared computer.",
              "A **6-digit verification code** is sent to your inbox. It is valid for a short time (about 3 minutes).",
              "Enter the code on the **Verification** screen: your secure session is created and lasts up to 8 hours.",
            ],
          },
          {
            type: "callout",
            kind: "tip",
            title: "Code expired?",
            children:
              "Request a new code directly from the verification screen. Codes expire quickly, so enter it as soon as you receive it.",
          },
          {
            type: "callout",
            kind: "important",
            title: "Protect your session",
            children:
              "Sign out on shared machines (profile menu) and never share your session. Your connection is a token stored by your browser; the platform also refreshes your activity in real time.",
          },
        ],
      },
      {
        id: "home-screen",
        title: "The home screen",
        blocks: [
          {
            type: "p",
            children:
              "The home screen adapts to your role. It gives you the health of your own activity (employees) or of the whole organisation (administrators and supervisors).",
          },
          {
            type: "table",
            columns: ["Profile", "Home screen"],
            rows: [
              [
                "Employee",
                "**My activity**: my tickets, still open requests, resolution rate, median resolution time, plus the next steps of a request.",
              ],
              [
                "Administrator or Supervisor",
                "**Organisation-wide overview**: KPI cards (open tickets, SLA at risk, SLA compliance, MTTR), ticket queue, SLA status, service catalogue and activity feed.",
              ],
            ],
          },
          {
            type: "p",
            children:
              "Use the **left menu** to navigate. The groups you see depend on your role — the table below summarises who sees what.",
          },
        ],
      },
      {
        id: "navigation",
        title: "The menu, group by group",
        blocks: [
          {
            type: "table",
            columns: ["Menu group", "Visible to", "Main entries"],
            rows: [
              [
                "My work",
                "Everyone",
                "My activity, My Tickets.",
              ],
              [
                "Support",
                "Administrators only",
                "Dashboard, Dispatch centre.",
              ],
              [
                "Control",
                "Administrators and Supervisors",
                "Tickets to handle, My Tickets.",
              ],
              [
                "Services",
                "Everyone",
                "Service catalogue, SLA response deadlines, Experts & problems. Employees read them; administrators and supervisors manage them.",
              ],
              [
                "Recommendations",
                "Everyone",
                "Recommendations, Knowledge base — plus **My publications** for administrators and supervisors.",
              ],
              [
                "Organisation",
                "Everyone",
                "Users & teams, Workflows, **User manual**, Personal settings (employees) or Settings (administrators and supervisors).",
              ],
              [
                "Platform administration",
                "Administrators only",
                "Company information, Departments, Organizational Structure, Users & teams, Reports & KPIs.",
              ],
            ],
          },
          {
            type: "p",
            children:
              "The header also holds **global search** (tickets, people, services…), the **notification bell**, your **availability** status and your profile menu. Many directory screens add a per-screen search and voice input.",
          },
        ],
      },
      {
        id: "notifications",
        title: "Notifications and counters",
        blocks: [
          {
            type: "p",
            children:
              "The **bell** collects the events that concern you (ticket created, assigned, resolved, recommendation received, catalogue change…). It keeps the last 50 events: open one to mark it read, or use **Mark all as read**. Notifications can also alert you with a sound.",
          },
          {
            type: "p",
            children:
              "Two sidebar badges summarise what is waiting. Each badge has its **own \u201cseen\u201d cursor**: the number belongs to you and clears when you actually open the screen.",
          },
          {
            type: "table",
            columns: ["Badge", "Meaning", "Where"],
            rows: [
              [
                "Dispatch centre",
                "Tickets that arrived and have not had a first review yet.",
                "Administrators — **Dispatch centre** (Support).",
              ],
              [
                "Tickets to handle",
                "Tickets waiting for you under analysis or in progress.",
                "Administrators and Supervisors — **Tickets to handle** (Control).",
              ],
            ],
          },
          {
            type: "p",
            children:
              "The platform refreshes open screens **in real time** (socket): a colleague's action can update your screen without a reload.",
          },
        ],
      },
      {
        id: "workflows-reference",
        title: "The Workflows page",
        blocks: [
          {
            type: "p",
            children:
              "Every process described in this manual is also drawn as a **BPMN diagram** on the **Workflows** page: the ticket lifecycle, the SLA sweep, the catalogue, the material flow, the expertise referential and the administrative actions. Each diagram shows who does what (Requester, Dispatch, Supervisor, System) and can be downloaded as a **PNG**.",
          },
          {
            type: "p",
            children:
              "Keep the two views in mind: diagrams show the flow at a glance, this manual explains the rules, the screens and the safeguards.",
          },
        ],
      },
    ],
  },
  {
    id: "common-workspace",
    title: "Everyday workspace",
    audience: "all",
    intro:
      "Declaring a request, ordering a service, following it, rating the resolution: the common core of the platform, used daily by every employee, supervisor and administrator.",
    sections: [
      {
        id: "declare-ticket",
        title: "Declaring a ticket",
        blocks: [
          {
            type: "p",
            children:
              "Open **My Tickets**, then **New ticket**. The form requires a **title**, a **description** and a **priority**. The department and unit are taken from your profile automatically.",
          },
          {
            type: "steps",
            title: "Minimum values",
            steps: [
              "**Title**: at least 3 characters.",
              "**Description**: at least 5 characters — describe the facts, what you tried and the expected outcome.",
              "**Priority**: choose among the available levels; it drives the promise (SLA).",
            ],
          },
          {
            type: "p",
            children:
              "The request is created with the status **new**. The dispatch centre is notified and will review it. You can follow the resolution live from **My Tickets**.",
          },
          {
            type: "callout",
            kind: "tip",
            children:
              "The more precise the description, the faster the routing: include a machine name, a room, a department, a screenshot or anything that helps a supervisor act without a second exchange.",
          },
        ],
      },
      {
        id: "order-service",
        title: "Ordering from the service catalogue",
        blocks: [
          {
            type: "p",
            children:
              "The **Service catalogue** lists the ready-made requests (e.g. \u201cLaptop for a new employee\u201d, \u201cShared mailbox\u201d). Each service carries a priority, a scope and a dedicated supervisor.",
          },
          {
            type: "steps",
            title: "To order a service",
            steps: [
              "Open **Service catalogue** and browse the active services (search and voice input are available).",
              "Open a service card and **apply**.",
              "A confirmation shows the **reference** of your request and the **dedicated supervisor** who will handle it. Use **Track it** to jump to your tickets.",
            ],
          },
          {
            type: "callout",
            kind: "important",
            title: "Catalogue requests skip the queue",
            children:
              "A catalogue order is created directly at status **under analysis**, assigned to the service's dedicated supervisor. If that supervisor is currently **unavailable** or is no longer a supervisor, the request is refused (error 409) and you can retry later.",
          },
        ],
      },
      {
        id: "follow-ticket",
        title: "Following a ticket",
        blocks: [
          {
            type: "p",
            children:
              "In **My Tickets**, open a request with **Details** to see its history and status. The statuses, in order: **new → being reviewed → under analysis → in progress → resolved → closed**.",
          },
          {
            type: "steps",
            title: "While the request is still new",
            steps: [
              "**Edit**: change the title, the description or the priority.",
              "**Cancel**: close the request yourself, before the first review.",
            ],
          },
          {
            type: "callout",
            kind: "note",
            children:
              "Editing and cancelling by the requester are only possible while the ticket is **new**. Once the first review has started (being reviewed), it is with the administrator: ask him/her, contact a supervisor, or wait.",
          },
          {
            type: "p",
            children:
              "Everything refreshes live: when a supervisor accepts, resolves or hands the ticket back, your screen updates by itself.",
          },
        ],
      },
      {
        id: "rating",
        title: "Rating the resolution",
        blocks: [
          {
            type: "p",
            children:
              "Once a ticket has been **resolved**, you can rate the handling from 1 to 5 stars. The rating is optional, can be revised later, and goes to the supervisor who handled the request and to the administrators.",
          },
          {
            type: "callout",
            kind: "note",
            children:
              "A rating is possible as soon as the ticket was resolved at least once — even if it was later closed by an administrator.",
          },
        ],
      },
      {
        id: "sla-deadlines",
        title: "SLA response deadlines",
        blocks: [
          {
            type: "p",
            children:
              "The **SLA response deadlines** page shows the promise attached to each priority: **alert after** (the warning threshold) and **respond within**. The counter runs **while the ticket is new** — the response is a first review by the dispatch centre.",
          },
          {
            type: "table",
            columns: ["Priority", "Alert after", "Respond within"],
            rows: [
              ["Critical", "30 minutes", "60 minutes"],
              ["High", "60 minutes", "2 hours"],
              ["Medium", "2 hours", "4 hours"],
              ["Low", "4 hours", "8 hours"],
            ],
          },
          {
            type: "callout",
            kind: "note",
            children:
              "The values above are the factory defaults. Your administrator can tune them on the **SLA response deadlines** page — the white screen always shows the current values. The page also explains the three states: **On time**, **At alert** and **Breached**.",
          },
        ],
      },
      {
        id: "recommendations-inbox",
        title: "Reading recommendations",
        blocks: [
          {
            type: "p",
            children:
              "**Recommendations** carry operational messages from administrators and supervisors to a chosen audience (department, unit). Unread messages show a dot. Open one to mark it read, or use **Mark all as read**. Attached documents are downloadable by the recipients (and the author).",
          },
          {
            type: "callout",
            kind: "note",
            children:
              "The audience of a recommendation is frozen at publication. The author is never among the recipients of their own broadcast.",
          },
        ],
      },
      {
        id: "knowledge-base",
        title: "Using the knowledge base",
        blocks: [
          {
            type: "p",
            children:
              "The **Knowledge base** gathers the articles (procedures, good practices, known issues) written by administrators and supervisors. You can search by text, department, unit or author, open an article and download its attachments. Employees read; they do not write.",
          },
          {
            type: "p",
            children:
              "To request a new article, contact a supervisor of your department — supervisors write for their scope, administrators anywhere.",
          },
        ],
      },
      {
        id: "experts-read",
        title: "Experts & problems",
        blocks: [
          {
            type: "p",
            children:
              "The **Experts & problems** referential lists, per department and unit, the recurring problems and who is the recognised expert (principal and substitutes). Employees consult it read-only; it also feeds the system that suggests the best expert when a supervisor declares a ticket.",
          },
        ],
      },
      {
        id: "personal-settings",
        title: "Personal settings",
        blocks: [
          {
            type: "p",
            children:
              "**Personal settings** regroups your identity and your security. Several panels are available.",
          },
          {
            type: "table",
            columns: ["Panel", "What you can do"],
            rows: [
              [
                "Identity & contact",
                "Change your name, email, phone, address and photo. Changing the email requires your current password.",
              ],
              [
                "Password",
                "Set a new password (at least 8 characters) with confirmation; your current password is required.",
              ],
              [
                "Where you work",
                "Your role, department and unit — **read-only**. To change them, ask your administrator.",
              ],
              [
                "Availability",
                "Tell the platform if you are **Available** or why you are not (Sick, Vacation, Business trip, Training, Other), with an optional note and an expected return date.",
              ],
            ],
          },
          {
            type: "callout",
            kind: "important",
            title: "Availability is decided by you",
            children:
              "Setting an expected return date does **not** automatically restore your availability. You remain unavailable until you switch yourself back to **Available**; while you are, you cannot be assigned new tickets.",
          },
        ],
      },
    ],
  },
  {
    id: "supervisor-guide",
    title: "Supervisor guide",
    audience: "supervisor",
    intro:
      "The **Supervisor** profile (role `manager`, displayed as \u201cSupervisor (Responsable)\u201d) is the operational level: it handles the tickets assigned to it, writes the reference content of its scope, and keeps the catalogue and material returns moving. Everything in the everyday chapter applies too.",
    sections: [
      {
        id: "tickets-to-handle",
        title: "Tickets to handle",
        blocks: [
          {
            type: "p",
            children:
              "The **Tickets to handle** screen lists the requests waiting for you: under analysis (to accept) or in progress (to finish). The sidebar badge tells you how many are waiting. Each action is possible only on **tickets assigned to you**.",
          },
          {
            type: "steps",
            title: "Accept and start",
            steps: [
              "Open the ticket and click **Accept and start**.",
              "Optional: release material — pick the **product**, the **quantity** and whether the units are **reusable** or **consumed**. The stock is decremented atomically; if the stock is not sufficient, the accept is refused.",
              "The ticket moves to **in progress** and the requester is informed.",
            ],
          },
          {
            type: "steps",
            title: "Mark as handled",
            steps: [
              "Open the in-progress ticket, fill in the **resolution note** (at least 5 characters).",
              "Confirm **Mark as handled**: the ticket becomes **resolved** and the requester can rate the resolution.",
            ],
          },
          {
            type: "steps",
            title: "Hand back to dispatch",
            steps: [
              "If you cannot take the ticket (wrong scope, missing info), choose **Hand back to dispatch**.",
              "The reason is mandatory (at least 10 characters): the ticket returns to **being reviewed** and is no longer assigned to you.",
            ],
          },
          {
            type: "callout",
            kind: "important",
            title: "Incorrect operation?",
            children:
              "A ticket must be **under analysis** to be accepted and **in progress** to be resolved or handed back; you can only act on your own assignments. Outside those cases the platform refuses the operation.",
          },
        ],
      },
      {
        id: "publications",
        title: "Publishing recommendations",
        blocks: [
          {
            type: "steps",
            title: "Publish a recommendation",
            steps: [
              "Open **My publications**, click **New recommendation**.",
              "Choose the **audience**: one or more departments, possibly restricted to units.",
              "Write the message and optionally attach a document.",
              "Publish: the recipients are frozen at that moment, and you are never among them.",
            ],
          },
          {
            type: "p",
            children:
              "**My publications** shows your broadcasts with the number of recipients and those who have read. Open one to see the live audience (read / not yet read). You can **delete** your own publications.",
          },
          {
            type: "callout",
            kind: "note",
            children:
              "A publication's audience cannot be changed after publishing; to correct, delete and republish.",
          },
        ],
      },
      {
        id: "kb-writing",
        title: "Writing knowledge base articles",
        blocks: [
          {
            type: "steps",
            title: "Write an article",
            steps: [
              "In the **Knowledge base**, click **New article** (writing is for administrators and supervisors).",
              "Fill in the title, the contents, the target **department** and **unit** (scope), a **sector** (one of the department's services) and optionally an attachment.",
              "Save: the article is immediately visible to its audience.",
            ],
          },
          {
            type: "p",
            children:
              "You can **edit** and **delete** your own articles. Someone else's article is untouchable — even an administrator cannot rewrite it (an administrator may only delete it).",
          },
        ],
      },
      {
        id: "catalogue-management",
        title: "Managing the service catalogue",
        blocks: [
          {
            type: "p",
            children:
              "Administrators and supervisors manage the catalogue from **Service catalogue** (management view). A service holds a name, a description, the **scope** it serves (optional department / unit), a **dedicated supervisor** (must be an existing supervisor account), a **default priority** and an **active** flag.",
          },
          {
            type: "steps",
            title: "Create or adjust a service",
            steps: [
              "Click **New service** and fill in the service card.",
              "Choose the dedicated supervisor — the platform verifies it is a supervisor (manager) account.",
              "Save: the service is broadcast to every screen in real time (new service, change or deletion).",
            ],
          },
          {
            type: "callout",
            kind: "important",
            title: "Availability is checked at order time, not configuration time",
            children:
              "You can configure a service whose supervisor is currently unavailable: the request will then be refused (409) when an employee orders it. Keep the supervisors up to date to avoid blocking requests.",
          },
          {
            type: "callout",
            kind: "warning",
            title: "Deleting is immediate",
            children:
              "Nothing prevents deleting a service. Open tickets are safe: each one copied the service's title, priority and scope when it was created.",
          },
        ],
      },
      {
        id: "material-returns",
        title: "Material returns",
        blocks: [
          {
            type: "p",
            children:
              "In **Assets & CMDB**, the **Returns** tab lists the **reusable** products still in someone's hands. As a supervisor you can declare a return when the material comes back: select the product line and the returned quantity — the stock is incremented.",
          },
          {
            type: "callout",
            kind: "note",
            children:
              "Only **reusable** products can be returned; **consumed** items (media, consumables) leave the stock forever when they are released on a ticket.",
          },
        ],
      },
      {
        id: "experts-manage",
        title: "Experts & problems: declaring problems",
        blocks: [
          {
            type: "steps",
            title: "Declare a recurring problem",
            steps: [
              "Open **Experts & problems**, click **declare** a problem.",
              "Give a **title** and a **description**. Your **unit** is forced to your own unit and you become its expert. The entry is coded automatically (PRB-…).",
              "The system can now propose you when a ticket matches this unit and wording.",
            ],
          },
          {
            type: "p",
            children:
              "You can **edit** or **delete** an entry only if you are one of its experts, and you cannot change the **expert list** when you edit it. Need to open a problem for another unit or another expert? Ask an administrator.",
          },
        ],
      },
      {
        id: "directory",
        title: "Users & teams (directory)",
        blocks: [
          {
            type: "p",
            children:
              "For supervisors, **Users & teams** is a **read-only directory**: search or browse your colleagues, open a person's card. Confidential fields (phone, address, account details) are hidden. Availability is the key detail to know who can take a ticket.",
          },
        ],
      },
    ],
  },
  {
    id: "admin-guide",
    title: "Administrator guide",
    audience: "admin",
    intro:
      "The **Administrator** profile (role `admin`, displayed as \u201cManager (Gérant)\u201d) runs the platform: dispatch, users, organisation, SLA policy, assets and full content control. Every supervisor and employee capability is included.",
    sections: [
      {
        id: "dispatch-centre",
        title: "The dispatch centre",
        blocks: [
          {
            type: "p",
            children:
              "**Dispatch centre** is the central screen. Tiles show the count per status; filters let you search by text, status, department, unit and **response** state (Awaiting, Overdue, Replied late, Replied on time).",
          },
          {
            type: "steps",
            title: "Take a ticket in review",
            steps: [
              "Select a **new** ticket, click **Take in review**.",
              "The ticket becomes **being reviewed**, records who reviewed it and when, and **freezes the SLA response clock**: the promised deadline and the response state are stored on the ticket.",
            ],
          },
          {
            type: "steps",
            title: "Assign (or reassign) to a supervisor",
            steps: [
              "Select a ticket in being reviewed / under analysis / in progress, click **Assign / Reassign**.",
              "Pick a supervisor: the list is filtered to the scope (department / unit) and enriched with each person's availability and expertise.",
              "Unavailable supervisors are shown but disabled, with their absence reason.",
              "Confirm: the ticket moves to **under analysis** (or keeps its status on a pure reassignment) and the supervisor is notified.",
            ],
          },
          {
            type: "steps",
            title: "Close or delete",
            steps: [
              "**Close** works from any status (except already closed): the reason is mandatory (at least 10 characters).",
              "**Delete** removes the ticket and its history — but only if no **reusable material** released on it is still outstanding; otherwise the platform refuses, naming the employee and the ticket.",
            ],
          },
          {
            type: "callout",
            kind: "important",
            title: "An unavailable supervisor cannot be assigned",
            children:
              "Assignment is refused (409) when the target is unavailable. Choose another supervisor or ask the person to set themselves back to **Available**.",
          },
        ],
      },
      {
        id: "sla-policy",
        title: "SLA policy",
        blocks: [
          {
            type: "p",
            children:
              "The **SLA response deadlines** page (management view) has two parts: the **policy** and the **stats**.",
          },
          {
            type: "steps",
            title: "Configure the policy",
            steps: [
              "Enable or disable the SLA with the toggle.",
              "For each priority, set **Alert after** and **Respond within** (in hours and minutes). The alert threshold must be shorter than the response deadline.",
              "Click **Save policy**: the new values are applied immediately (no restart), and the policy update is recorded.",
            ],
          },
          {
            type: "p",
            children:
              "The **Response punctuality** card shows the live stats: on-time rate, late replies, tickets still awaiting their first response, and tickets overdue right now. This is the only analytics endpoint currently exposed by the backend.",
          },
        ],
      },
      {
        id: "users-administration",
        title: "Users & teams (management)",
        blocks: [
          {
            type: "steps",
            title: "Create an account",
            steps: [
              "In **Users & teams**, click **New user**.",
              "Fill in the identity (name, email, phone, address), the **department** (code DEPT-…) and the **unit** of the person, their **role(s)** and their initial **availability**.",
              "The account is created and the person can sign in with the email and a temporary password (send password).",
            ],
          },
          {
            type: "p",
            children:
              "You can **update** a user (role, department, unit, availability), **reset their password** (a temporary password is generated, the person must change it at the next sign-in — the history is kept), and **delete** an account.",
          },
          {
            type: "callout",
            kind: "warning",
            title: "Two safeguards never to forget",
            children:
              "The platform refuses to **delete yourself** and refuses to delete or demote the **last remaining administrator**. Always keep at least one administrator account with full access.",
          },
        ],
      },
      {
        id: "company-departments-units",
        title: "Company, departments, organisational structure",
        blocks: [
          {
            type: "p",
            children:
              "Three screens shape the organisation, in **Platform administration**.",
          },
          {
            type: "table",
            columns: ["Screen", "What it does"],
            rows: [
              [
                "Company information",
                "Name, business domain, description, list of services and logo (up to 512 KB). The logo and name feed the login screen and the sidebar.",
              ],
              [
                "Departments",
                "Create and edit departments (name, description). **Deleting is blocked** while a root unit or assigned users still depend on the department.",
              ],
              [
                "Organizational Structure",
                "Hierarchical units (1, 1.1, 1.1.1…). Each root belongs to a department; add sub-units, edit, delete.",
              ],
            ],
          },
          {
            type: "callout",
            kind: "warning",
            title: "Deleting a unit removes the whole branch",
            children:
              "Unlike departments, deleting a unit has **no dependency check**: the unit and all its sub-units disappear in one step. There is no confirmation. Check the tree before deleting.",
          },
        ],
      },
      {
        id: "assets-admin",
        title: "Assets & CMDB — inventory",
        blocks: [
          {
            type: "steps",
            title: "Manage the product catalogue",
            steps: [
              "**Create** a product: name, category, unit, stock quantity, **reusable / consumed** type, optional brand, model, description and image. The code (MAT-…) is allocated automatically.",
              "**Edit** a product, including its stock — a lowered quantity is recorded as a loss.",
              "**Delete** a product: blocked (409) while **reusable** units of it are still in someone's hands; the platform names the employee and the ticket. Consumed items never block.",
            ],
          },
          {
            type: "p",
            children:
              "The **Returns** tab (shared with supervisors) lists outstanding reusable units so their lines can be closed. The inventory is broadcast in real time to every screen.",
          },
        ],
      },
      {
        id: "experts-admin",
        title: "Experts & problems (administrator)",
        blocks: [
          {
            type: "p",
            children:
              "As an administrator you manage the **whole** referential: declare a problem for **any** department and unit, set the **expert list** (principal + substitutes), edit or delete any entry — without the unit/ownership restrictions that bind supervisors.",
          },
        ],
      },
      {
        id: "knowledge-admin",
        title: "Knowledge base (administrator)",
        blocks: [
          {
            type: "p",
            children:
              "You write articles everywhere and you can **delete any** article. The only limit: an article is **edited** by its author only — even you cannot rewrite someone else's; you can delete it and ask the author to republish.",
          },
        ],
      },
      {
        id: "recommendations-admin",
        title: "Recommendations (administrator)",
        blocks: [
          {
            type: "p",
            children:
              "You publish recommendations platform-wide, follow your **My publications** (recipients, read status, delete your own) and see the same inbox as everyone else.",
          },
        ],
      },
      {
        id: "reports",
        title: "Reports & KPIs",
        blocks: [
          {
            type: "p",
            children:
              "**Reports & KPIs** is the executive view: ticket volume and backlog, SLA compliance, tickets breached or at risk, MTTA / MTTR, first contact resolution, reopening and escalation rates, CSAT, service health and department performance, all with trend charts and a \u201cwhat this means\u201d reading.",
          },
          {
            type: "callout",
            kind: "note",
            children:
              "This module currently shows **representative figures** to demonstrate the screens; the live reporting service is being finalised. The SLA page (Response punctuality) already shows live statistics.",
          },
        ],
      },
    ],
  },
  {
    id: "reference",
    title: "Processes & reference",
    audience: "all",
    intro:
      "The consolidated reference: the ticket lifecycle, how the SLA really works, and the complete permission matrix with the safeguards that protect the data.",
    sections: [
      {
        id: "lifecycle",
        title: "The ticket lifecycle",
        blocks: [
          {
            type: "table",
            columns: ["Status", "Meaning", "Set by"],
            rows: [
              ["new", "Just declared, waiting for a first review.", "The requester (or the catalogue order)."],
              ["being_reviewed", "Under the dispatcher's eye before assignment.", "Administrator — take in review."],
              ["under_analysis", "Assigned to a supervisor, not accepted yet.", "Administrator — assign; catalogue orders arrive here."],
              ["in_progress", "Accepted: work has started.", "Supervisor — accept and start."],
              ["resolved", "Handled, waiting for the requester's rating and closure.", "Supervisor (or administrator) — mark as handled."],
              ["closed", "File closed.", "Administrator — close; or requester — cancel while new / being reviewed."],
            ],
          },
          {
            type: "p",
            children:
              "There is no re-open transition: after closure, a new request must be declared. A deleted ticket disappears with its history — an exceptional, administrator-only action.",
          },
        ],
      },
      {
        id: "sla-mechanics",
        title: "How the SLA really works",
        blocks: [
          {
            type: "p",
            children:
              "The SLA response clock runs **only while a ticket is new**: from declaration to the first review. A sweep every minute recomputes each ticket's deadline (on time → at alert → breached) and notifies the administrators **only when a ticket gets worse** — one alert per degradation, not a flood.",
          },
          {
            type: "p",
            children:
              "At the first review the clock stops: the response time, the promised deadline and the response state are **frozen** on the ticket and shown thereafter. What happens after the review (assignment, work, resolution) is not part of the SLA countdown.",
          },
        ],
      },
      {
        id: "permissions",
        title: "Permission matrix",
        blocks: [
          {
            type: "table",
            columns: ["Area", "Employee", "Supervisor", "Administrator"],
            rows: [
              ["Tickets — declare and follow", "✓", "✓", "✓"],
              ["Tickets — edit / cancel own (while new)", "✓", "✓", "✓"],
              ["Tickets — accept, handle, hand back (own)", "—", "✓", "✓"],
              ["Tickets — review, assign, close any, delete", "—", "—", "✓"],
              ["Tickets — rate after resolution", "✓", "✓", "✓"],
              ["Service catalogue — order", "✓", "✓", "✓"],
              ["Service catalogue — manage", "—", "✓", "✓"],
              ["Assets — view inventory", "—", "✓", "✓"],
              ["Assets — manage products (create / edit / delete)", "—", "—", "✓"],
              ["Material returns", "—", "✓", "✓"],
              ["SLA — view deadlines", "✓", "✓", "✓"],
              ["SLA — policy and stats", "—", "—", "✓"],
              ["Knowledge base — read", "✓", "✓", "✓"],
              ["Knowledge base — write", "—", "own articles", "create + delete any"],
              ["Recommendations — receive", "✓", "✓", "✓"],
              ["Recommendations — publish / manage", "—", "own", "own"],
              ["Experts & problems — consult", "✓", "✓", "✓"],
              ["Experts & problems — manage", "—", "own unit / own entries", "any entry"],
              ["Users & teams — directory", "read (redacted)", "read (redacted)", "full + manage"],
              ["Company / departments / units", "—", "—", "manage"],
              ["Reports & KPIs", "—", "—", "✓"],
            ],
          },
          {
            type: "callout",
            kind: "note",
            children:
              "\u201cSupervisor\u201d here is the role `manager` (displayed \u201cSupervisor (Responsable)\u201d). An administrator is always admitted to the supervisor's operations. A user with no role configured is treated as a legacy administrator.",
          },
        ],
      },
      {
        id: "safeguards",
        title: "Rules and safeguards",
        blocks: [
          {
            type: "list",
            items: [
              "**Last administrator** — the last administrator can never be deleted or demoted; you can never delete your own account.",
              "**Author-only editing (knowledge)** — an article is edited by its author only; an administrator can delete it but not rewrite it.",
              "**Experts ownership (supervisors)** — a supervisor declares problems only for their own unit (appearing as its expert) and edits only the entries where they are an expert; the expert list cannot be changed on edit.",
              "**Availability is operational** — an unavailable person cannot be assigned a ticket or receive a catalogue order; announcing an expected return date does not switch the account back to Available.",
              "**Material delete guard** — a product cannot be removed while reusable units are in circulation (the refusal names the employee and the ticket).",
              "**Ticket delete guard** — a ticket with an outstanding reusable material line cannot be deleted.",
              "**Department delete guard** — a department cannot be deleted while a root unit or assigned users depend on it.",
              "**Unit delete = whole branch** — removing a unit deletes all its sub-units in one step and without confirmation.",
              "**Service delete is immediate** — deleting a service is not blocked; open tickets keep the title, priority and scope they copied.",
              "**Recipients are frozen** — a recommendation's audience is fixed at publication; the author is never among the recipients.",
              "**SLA only measures the new phase** — after the first review the countdown is frozen, and the rest of the lifecycle is not timed.",
            ],
          },
        ],
      },
    ],
  },
]