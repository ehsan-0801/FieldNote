import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { NoteKind, Priority, Role, WorkOrderStatus } from "../src/generated/prisma/enums";
import { NO_FACTORS, assessPriority, type PriorityFactorValues } from "../src/domain/priority";

config({ path: [".env.local", ".env"], quiet: true });

const DEMO_ADMIN_EMAIL = "admin@fieldnote.com";
const DEMO_ADMIN_PASSWORD = "password123";
const DEMO_MEMBER_PASSWORD = "fieldnote-demo-2026";
const KNOWN_WEAK_PASSWORDS = new Set([DEMO_ADMIN_PASSWORD, DEMO_MEMBER_PASSWORD, "password", "changeme"]);

const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");
const schema = process.env.DATABASE_SCHEMA || undefined;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }, schema ? { schema } : undefined) });

const CATEGORIES = [
  { slug: "electrical", name: "Electrical", description: "Lights, sockets, switches, breakers" },
  { slug: "plumbing", name: "Plumbing", description: "Taps, toilets, leaks, drains" },
  { slug: "heating-ventilation", name: "Heating & ventilation", description: "Radiators, air handling, temperature" },
  { slug: "doors-access", name: "Doors & access", description: "Locks, badge readers, hinges" },
  { slug: "cleaning-waste", name: "Cleaning & waste", description: "Spills, bins, pests" },
  { slug: "furniture-fixtures", name: "Furniture & fixtures", description: "Chairs, desks, shelving, blinds" },
  { slug: "it-av", name: "IT & AV", description: "Wi-Fi, projectors, displays, printers" },
  { slug: "grounds", name: "Grounds", description: "Courtyard, bike store, paths, gates" },
] as const;

type CategorySlug = (typeof CATEGORIES)[number]["slug"];

async function upsertWorkspace(slug: string, name: string) {
  return db.workspace.upsert({ where: { slug }, create: { slug, name }, update: {} });
}

async function upsertCategories(workspaceId: string) {
  const bySlug = new Map<CategorySlug, string>();
  for (const category of CATEGORIES) {
    const row = await db.category.upsert({
      where: { workspaceId_slug: { workspaceId, slug: category.slug } },
      create: { workspaceId, ...category },
      update: {},
    });
    bySlug.set(category.slug, row.id);
  }
  return bySlug;
}

async function ensureUser(workspaceId: string, email: string, name: string, role: Role, password: string, isActive = true) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  return db.user.create({
    data: { workspaceId, email, name, role, isActive, passwordHash: await bcrypt.hash(password, 12) },
  });
}

async function seedProduction() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    throw new Error("Refusing to seed production without ADMIN_EMAIL and ADMIN_PASSWORD.");
  }
  if (email === DEMO_ADMIN_EMAIL || password.length < 12 || KNOWN_WEAK_PASSWORDS.has(password)) {
    throw new Error("Refusing to seed production with the demo administrator or a weak password (12+ characters required).");
  }
  const workspace = await upsertWorkspace(
    process.env.WORKSPACE_SLUG?.trim() || "main",
    process.env.WORKSPACE_NAME?.trim() || "Fieldnote Workspace",
  );
  await upsertCategories(workspace.id);
  await ensureUser(workspace.id, email, "Administrator", Role.ADMIN, password);
  console.log(`Production seed complete for workspace “${workspace.name}”. No demo data was created.`);
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

interface SeedEvent {
  hours: number;
  by: string;
  to?: WorkOrderStatus;
  reason?: string;
  assign?: string;
  note?: { kind: NoteKind; body: string };
  confirmPriority?: boolean;
}

interface SeedWorkOrder {
  title: string;
  report: string;
  summary: string;
  location: string | null;
  asset?: string;
  category: CategorySlug;
  reporter: string;
  createdHoursAgo: number;
  factors?: Partial<PriorityFactorValues>;
  events: SeedEvent[];
  resolutionNote?: string;
}

async function seedDemo() {
  const workspace = await upsertWorkspace("northgate-commons", "Northgate Commons");
  const categories = await upsertCategories(workspace.id);

  const people = {
    admin: await ensureUser(workspace.id, DEMO_ADMIN_EMAIL, "Morgan Hale", Role.ADMIN, DEMO_ADMIN_PASSWORD),
    priya: await ensureUser(workspace.id, "priya@northgate.test", "Priya Raman", Role.COORDINATOR, DEMO_MEMBER_PASSWORD),
    tomas: await ensureUser(workspace.id, "tomas@northgate.test", "Tomás Ferreira", Role.TECHNICIAN, DEMO_MEMBER_PASSWORD),
    hana: await ensureUser(workspace.id, "hana@northgate.test", "Hana Kim", Role.TECHNICIAN, DEMO_MEMBER_PASSWORD),
    jordan: await ensureUser(workspace.id, "jordan@northgate.test", "Jordan Ellis", Role.REPORTER, DEMO_MEMBER_PASSWORD),
    sam: await ensureUser(workspace.id, "sam@northgate.test", "Sam Whitaker", Role.REPORTER, DEMO_MEMBER_PASSWORD),
    leo: await ensureUser(workspace.id, "leo@northgate.test", "Leo Grant", Role.TECHNICIAN, DEMO_MEMBER_PASSWORD, false),
  };
  const directory = new Map<string, { id: string; name: string }>(Object.entries(people));
  const findPerson = (key: string) => {
    const found = directory.get(key);
    if (!found) throw new Error(`Seed data refers to unknown person “${key}”.`);
    return found;
  };

  // A second workspace proves isolation in the demo: none of this is visible from Northgate.
  const harbor = await upsertWorkspace("harbor-studio", "Harbor Studio Collective");
  const harborCategories = await upsertCategories(harbor.id);
  const ade = await ensureUser(harbor.id, "ade@harbor.test", "Ade Okonkwo", Role.REPORTER, DEMO_MEMBER_PASSWORD);

  if ((await db.workOrder.count({ where: { workspaceId: workspace.id } })) > 0) {
    console.log("Demo work orders already exist; users and categories were checked, nothing else changed.");
    return;
  }

  const orders: SeedWorkOrder[] = [
    {
      title: "Kitchen tap on level 2 drips constantly",
      report: "The cold tap in the level 2 kitchen won't turn fully off. It drips all day and it's been going since last week.",
      summary: "Cold tap in the level 2 kitchen does not shut off fully; continuous drip for about a week.",
      location: "Level 2 kitchen",
      category: "plumbing",
      reporter: "jordan",
      createdHoursAgo: 290,
      factors: { worsening: true },
      events: [
        { hours: 289, by: "jordan", to: WorkOrderStatus.TRIAGE },
        { hours: 270, by: "priya", confirmPriority: true, assign: "tomas" },
        { hours: 269, by: "priya", to: WorkOrderStatus.READY },
        { hours: 240, by: "tomas", to: WorkOrderStatus.IN_PROGRESS },
        { hours: 238, by: "tomas", note: { kind: NoteKind.PROGRESS, body: "Cartridge is worn. Fitted a replacement from stock." } },
        { hours: 236, by: "tomas", to: WorkOrderStatus.RESOLVED },
        { hours: 200, by: "priya", to: WorkOrderStatus.CLOSED },
      ],
      resolutionNote: "Replaced the tap cartridge (ceramic disc, 20 teeth). Ran for ten minutes with no drip.",
    },
    {
      title: "Badge reader at the east entrance rejects valid fobs",
      report:
        "The badge reader by the east doors keeps flashing red. Everyone on the morning shift was locked out and had to use the main entrance.",
      summary: "East entrance badge reader rejecting valid fobs; morning shift locked out and rerouted to the main entrance.",
      location: "East entrance",
      asset: "Reader ER-02",
      category: "doors-access",
      reporter: "sam",
      createdHoursAgo: 70,
      factors: { essentialServiceDown: true, multiplePeopleAffected: true },
      events: [
        { hours: 69.5, by: "sam", to: WorkOrderStatus.TRIAGE },
        { hours: 69, by: "priya", confirmPriority: true, assign: "hana" },
        { hours: 68.8, by: "priya", to: WorkOrderStatus.IN_PROGRESS },
        {
          hours: 67,
          by: "hana",
          note: { kind: NoteKind.PROGRESS, body: "Controller lost its schedule after last night’s power blip. Reloading from backup." },
        },
        { hours: 66, by: "hana", to: WorkOrderStatus.RESOLVED },
      ],
      resolutionNote: "Restored the access schedule from the Sunday backup and tested five fobs. Added a UPS check to next month’s round.",
    },
    {
      title: "Projector in room 3B shows no signal over HDMI",
      report: "The projector in 3B says no signal when we plug in a laptop over HDMI. We tried two laptops this morning.",
      summary: "Room 3B projector reports no HDMI signal with two different laptops.",
      location: "Room 3B",
      asset: "Ceiling projector",
      category: "it-av",
      reporter: "jordan",
      createdHoursAgo: 30,
      events: [
        { hours: 29.5, by: "jordan", to: WorkOrderStatus.TRIAGE },
        { hours: 26, by: "priya", confirmPriority: true, assign: "hana" },
        { hours: 25.9, by: "priya", to: WorkOrderStatus.READY },
        { hours: 4, by: "hana", to: WorkOrderStatus.IN_PROGRESS },
        {
          hours: 3.5,
          by: "hana",
          note: {
            kind: NoteKind.PROGRESS,
            body: "Wall plate HDMI cable tests faulty. Replacement ordered, using the trolley projector meanwhile.",
          },
        },
      ],
    },
    {
      title: "Radiators in the north studios are cold",
      report: "None of the radiators in the north studios are warm this morning. All the studio members are working in coats.",
      summary: "No heat from radiators across the north studios; members affected this morning.",
      location: "North studios",
      category: "heating-ventilation",
      reporter: "sam",
      createdHoursAgo: 20,
      factors: { essentialServiceDown: true, multiplePeopleAffected: true },
      events: [
        { hours: 19.8, by: "sam", to: WorkOrderStatus.TRIAGE },
        { hours: 19, by: "priya", confirmPriority: true, assign: "tomas" },
        { hours: 18.9, by: "priya", to: WorkOrderStatus.IN_PROGRESS },
        {
          hours: 17,
          by: "tomas",
          note: {
            kind: NoteKind.PROGRESS,
            body: "Boiler is firing. North zone valve looks stuck; bleeding radiators while I check the actuator.",
          },
        },
      ],
    },
    {
      title: "Ceiling stain above desk 14 drips when it rains",
      report: "There's a brown stain on the ceiling tile above desk 14 and it drips when it rains. The stain is getting bigger every week.",
      summary: "Water-stained ceiling tile above desk 14 that drips during rain; stain growing.",
      location: "Open studio, desk 14",
      category: "plumbing",
      reporter: "jordan",
      createdHoursAgo: 150,
      factors: { worsening: true },
      events: [
        { hours: 149, by: "jordan", to: WorkOrderStatus.TRIAGE },
        { hours: 140, by: "priya", confirmPriority: true, assign: "tomas" },
        { hours: 139, by: "priya", to: WorkOrderStatus.READY },
        { hours: 120, by: "tomas", to: WorkOrderStatus.IN_PROGRESS },
        {
          hours: 118,
          by: "tomas",
          note: {
            kind: NoteKind.PROGRESS,
            body: "Source is the roof gutter above, not internal pipework. Moved desk 14 and put a tray under the tile.",
          },
        },
        {
          hours: 117,
          by: "tomas",
          to: WorkOrderStatus.BLOCKED,
          reason: "Needs roof access; the landlord’s roofer is booked for Thursday.",
        },
      ],
    },
    {
      title: "Courtyard recycling bins overflowing",
      report: "The recycling bins in the courtyard are overflowing again and cardboard is blowing around. Several of us have mentioned it.",
      summary: "Courtyard recycling bins overflowing with loose cardboard; raised by several members.",
      location: "Courtyard",
      category: "cleaning-waste",
      reporter: "sam",
      createdHoursAgo: 10,
      factors: { multiplePeopleAffected: true },
      events: [
        { hours: 9.8, by: "sam", to: WorkOrderStatus.TRIAGE },
        { hours: 8, by: "priya", confirmPriority: true, assign: "hana" },
        { hours: 7.9, by: "priya", to: WorkOrderStatus.READY },
      ],
    },
    {
      title: "Broken chair in the Linden meeting room",
      report: "One of the chairs in Linden has a cracked base and tips back. I moved it to the corner.",
      summary: "Chair with a cracked base in the Linden meeting room, moved aside by the reporter.",
      location: "Linden meeting room",
      category: "furniture-fixtures",
      reporter: "jordan",
      createdHoursAgo: 6,
      events: [{ hours: 5.9, by: "jordan", to: WorkOrderStatus.TRIAGE }],
    },
    {
      title: "Exposed wiring behind the reception desk panel",
      report:
        "The side panel of the reception desk has come loose and there are exposed wires behind it, right where people put their bags.",
      summary: "Loose reception desk side panel exposing wiring in a spot where bags are placed.",
      location: "Reception",
      category: "electrical",
      reporter: "sam",
      createdHoursAgo: 3,
      factors: { safetyFlag: true },
      events: [{ hours: 2.9, by: "sam", to: WorkOrderStatus.TRIAGE }],
    },
    {
      title: "Ground floor accessible toilet won’t flush",
      report: "The accessible toilet on the ground floor won't flush at all. There's a sign on the door now.",
      summary: "Ground floor accessible toilet not flushing; out-of-order sign posted.",
      location: "Ground floor accessible toilet",
      category: "plumbing",
      reporter: "jordan",
      createdHoursAgo: 2,
      factors: { essentialServiceDown: true },
      events: [{ hours: 1.9, by: "jordan", to: WorkOrderStatus.TRIAGE }],
    },
    {
      title: "Bike store gate latch sticks",
      report: "The latch on the bike store gate sticks and you have to lift the gate to close it.",
      summary: "Bike store gate latch sticks; gate must be lifted to close.",
      location: "Bike store",
      category: "grounds",
      reporter: "sam",
      createdHoursAgo: 0.5,
      events: [],
    },
    {
      title: "Wi-Fi drops in the quiet room every afternoon",
      report:
        "Wi-Fi in the quiet room cuts out around 3pm every day, and it keeps happening for longer. Everyone in there loses their calls.",
      summary: "Daily afternoon Wi-Fi dropouts in the quiet room, lasting longer each time; calls dropped.",
      location: "Quiet room",
      category: "it-av",
      reporter: "jordan",
      createdHoursAgo: 52,
      factors: { multiplePeopleAffected: true, worsening: true },
      events: [
        { hours: 51, by: "jordan", to: WorkOrderStatus.TRIAGE },
        { hours: 48, by: "priya", confirmPriority: true, assign: "hana" },
        { hours: 47.9, by: "priya", to: WorkOrderStatus.READY },
        { hours: 30, by: "jordan", note: { kind: NoteKind.COMMENT, body: "Happened again today at 3:10, lasted about 20 minutes." } },
      ],
    },
    {
      title: "Loose stair nosing on the back stairwell",
      report: "The metal edge on the third step of the back stairwell is loose and someone nearly tripped on it.",
      summary: "Loose metal nosing on the third step of the back stairwell; near-miss trip reported.",
      location: "Back stairwell, step 3",
      category: "grounds",
      reporter: "sam",
      createdHoursAgo: 110,
      factors: { safetyFlag: true },
      events: [
        { hours: 109.5, by: "sam", to: WorkOrderStatus.TRIAGE },
        { hours: 109, by: "priya", confirmPriority: true, assign: "tomas" },
        { hours: 108.9, by: "priya", to: WorkOrderStatus.IN_PROGRESS },
        { hours: 106, by: "tomas", to: WorkOrderStatus.RESOLVED },
      ],
      resolutionNote: "Refixed the nosing with four new countersunk screws and checked the rest of the flight. All secure.",
    },
    {
      title: "Shared kitchen fridge not cooling",
      report: "The big fridge in the shared kitchen isn't cold. Milk went off overnight.",
      summary: "Shared kitchen fridge not holding temperature; food spoiling overnight.",
      location: "Shared kitchen",
      asset: "Fridge FR-1",
      category: "electrical",
      reporter: "jordan",
      createdHoursAgo: 100,
      factors: { essentialServiceDown: true },
      events: [
        { hours: 99, by: "jordan", to: WorkOrderStatus.TRIAGE },
        { hours: 98, by: "priya", confirmPriority: true, assign: "tomas" },
        { hours: 97.9, by: "priya", to: WorkOrderStatus.READY },
        { hours: 80, by: "tomas", to: WorkOrderStatus.IN_PROGRESS },
        {
          hours: 79,
          by: "tomas",
          note: {
            kind: NoteKind.PROGRESS,
            body: "Compressor runs but the condenser coils are clogged. Cleaned them; monitoring for 24 hours.",
          },
        },
      ],
    },
    {
      title: "Duplicate: east entrance reader",
      report: "East door badge thing not working.",
      summary: "Duplicate of the east entrance badge reader report.",
      location: "East entrance",
      category: "doors-access",
      reporter: "jordan",
      createdHoursAgo: 69,
      events: [
        { hours: 68.9, by: "jordan", to: WorkOrderStatus.TRIAGE },
        { hours: 68.5, by: "priya", to: WorkOrderStatus.ARCHIVED, reason: "Duplicate of the earlier east entrance report." },
      ],
    },
  ];

  let referenceNumber = 1001;
  for (const order of orders) {
    await seedWorkOrder(workspace.id, `WO-${referenceNumber++}`, order, findPerson, categories);
  }
  await db.workspace.update({ where: { id: workspace.id }, data: { nextReferenceNumber: referenceNumber } });

  await seedWorkOrder(
    harbor.id,
    "WO-1001",
    {
      title: "Darkroom extractor fan rattling",
      report: "The extractor fan in the darkroom rattles loudly when it starts up.",
      summary: "Darkroom extractor fan rattles at start-up.",
      location: "Darkroom",
      category: "heating-ventilation",
      reporter: "ade",
      createdHoursAgo: 12,
      events: [{ hours: 11.9, by: "ade", to: WorkOrderStatus.TRIAGE }],
    },
    () => ade,
    harborCategories,
  );
  await db.workspace.update({ where: { id: harbor.id }, data: { nextReferenceNumber: 1002 } });

  console.log("Demo data ready:");
  console.log(`  ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD} (admin)`);
  console.log(`  priya@, tomas@, hana@, jordan@, sam@northgate.test / ${DEMO_MEMBER_PASSWORD}`);
}

async function seedWorkOrder(
  workspaceId: string,
  reference: string,
  order: SeedWorkOrder,
  person: (key: string) => { id: string; name: string },
  categories: Map<CategorySlug, string>,
) {
  const reporter = person(order.reporter);
  const factors = { ...NO_FACTORS, ...order.factors };
  const assessment = assessPriority(factors);
  const createdAt = hoursAgo(order.createdHoursAgo);

  let status: WorkOrderStatus = WorkOrderStatus.SUBMITTED;
  let assignee: { id: string; name: string } | null = null;
  let priorityConfirmedAt: Date | null = null;
  let resolvedAt: Date | null = null;
  let closedAt: Date | null = null;
  let archivedAt: Date | null = null;
  const lastEvent = order.events.at(-1);
  const updatedAt = lastEvent ? hoursAgo(lastEvent.hours) : createdAt;

  for (const event of order.events) {
    if (event.assign) assignee = person(event.assign);
    if (event.confirmPriority) priorityConfirmedAt = hoursAgo(event.hours);
    if (event.to === WorkOrderStatus.RESOLVED) resolvedAt = hoursAgo(event.hours);
    if (event.to === WorkOrderStatus.CLOSED) closedAt = hoursAgo(event.hours);
    if (event.to === WorkOrderStatus.ARCHIVED) archivedAt = hoursAgo(event.hours);
    if (event.to) status = event.to;
  }

  const workOrder = await db.workOrder.create({
    data: {
      reference,
      workspaceId,
      reporterId: reporter.id,
      assigneeId: assignee?.id ?? null,
      categoryId: categories.get(order.category) ?? null,
      title: order.title,
      originalReport: order.report,
      summary: order.summary,
      locationLabel: order.location,
      assetLabel: order.asset ?? null,
      status,
      ...factors,
      impactScore: assessment.score,
      priority: assessment.priority,
      priorityRationale: assessment.rationale,
      priorityConfirmedAt,
      resolutionNote: status === WorkOrderStatus.RESOLVED || status === WorkOrderStatus.CLOSED ? (order.resolutionNote ?? null) : null,
      resolvedAt,
      closedAt,
      archivedAt,
      createdAt,
      updatedAt,
    },
  });

  const audit = (actorId: string, action: string, at: Date, details?: Prisma.InputJsonObject) =>
    db.auditEvent.create({
      data: { workspaceId, actorId, action, entityType: "WorkOrder", entityId: workOrder.id, details, createdAt: at },
    });

  await db.statusEvent.create({
    data: { workOrderId: workOrder.id, actorId: reporter.id, fromStatus: null, toStatus: WorkOrderStatus.SUBMITTED, createdAt },
  });
  await audit(reporter.id, "work_order.created", createdAt, { reference, reportLength: order.report.length });

  let previous: WorkOrderStatus = WorkOrderStatus.SUBMITTED;
  let previousAssignee: { id: string; name: string } | null = null;
  for (const event of order.events) {
    const actor = person(event.by);
    const at = hoursAgo(event.hours);
    if (event.confirmPriority) {
      await audit(actor.id, "work_order.priority_confirmed", at, {
        factors,
        priority: { from: Priority.LOW, to: assessment.priority },
        score: assessment.score,
      });
    }
    if (event.assign) {
      const next = person(event.assign);
      await audit(actor.id, "work_order.assigned", new Date(at.getTime() + 1000), {
        from: previousAssignee,
        to: { id: next.id, name: next.name },
      });
      previousAssignee = { id: next.id, name: next.name };
    }
    if (event.note) {
      const note = await db.workOrderNote.create({
        data: { workOrderId: workOrder.id, authorId: actor.id, kind: event.note.kind, body: event.note.body, createdAt: at },
      });
      await audit(actor.id, "work_order.note_added", at, { noteId: note.id, kind: note.kind, length: note.body.length });
    }
    if (event.to) {
      await db.statusEvent.create({
        data: {
          workOrderId: workOrder.id,
          actorId: actor.id,
          fromStatus: previous,
          toStatus: event.to,
          reason: event.reason ?? null,
          createdAt: at,
        },
      });
      if (event.to === WorkOrderStatus.RESOLVED && order.resolutionNote) {
        await db.workOrderNote.create({
          data: { workOrderId: workOrder.id, authorId: actor.id, kind: NoteKind.RESOLUTION, body: order.resolutionNote, createdAt: at },
        });
      }
      await audit(actor.id, "work_order.status_changed", new Date(at.getTime() + 2000), {
        from: previous,
        to: event.to,
        ...(event.reason ? { reason: event.reason } : {}),
      });
      previous = event.to;
    }
  }
}

async function main() {
  if (isProduction) await seedProduction();
  else await seedDemo();
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
