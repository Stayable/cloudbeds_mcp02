/**
 * Cloudbeds tool definitions, validated against pms-v1.2-openapi.yaml.
 * Registered onto an MCP server instance (works for both mcp-handler's HTTP
 * server and a plain stdio McpServer).
 *
 * Stayable's 8 properties are separate Cloudbeds accounts, so every call is
 * routed through a CloudbedsRegistry that picks the API key matching the
 * `propertyID` argument. `propertyID` is therefore effectively required unless
 * exactly one key/token is configured.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CloudbedsRegistry, CloudbedsError } from "./client.js";

async function run(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    const detail =
      err instanceof CloudbedsError
        ? `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}${
            err.requestId ? ` [request-id: ${err.requestId}]` : ""
          }`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Cloudbeds error: ${detail}` }],
    };
  }
}

const propertyID = z
  .string()
  .optional()
  .describe(
    "Cloudbeds property ID (selects the account/key). Required unless only one key is configured. Use list_properties to confirm IDs.",
  );

export function registerCloudbedsTools(
  server: McpServer,
  registry: CloudbedsRegistry,
  allowWrites: boolean,
): void {
  /* ------------------------------------------------------------- read tools */

  server.tool(
    "list_properties",
    "List every configured Cloudbeds account and the property each key resolves to (fans getHotels across all keys). Run this first to confirm propertyIDs.",
    {},
    async () => {
      const entries = registry.all();
      if (!entries.length) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "No Cloudbeds keys configured. Set CLOUDBEDS_API_KEY_<propertyID> (or CLOUDBEDS_API_KEY).",
            },
          ],
        };
      }
      const out: Record<string, unknown> = {};
      for (const { id, client } of entries) {
        try {
          out[id] = await client.get("getHotels");
        } catch (e) {
          out[id] = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }],
      };
    },
  );

  server.tool(
    "get_property",
    "Get details and settings for a single property (Cloudbeds getHotelDetails).",
    { propertyID: z.string().describe("Cloudbeds property ID") },
    ({ propertyID }) =>
      run(() => registry.resolve(propertyID).get("getHotelDetails", { propertyID })),
  );

  server.tool(
    "get_dashboard",
    "Get occupancy and KPI dashboard figures for a property/date (Cloudbeds getDashboard).",
    {
      propertyID,
      date: z
        .string()
        .optional()
        .describe("Business date YYYY-MM-DD; defaults to property's current date"),
    },
    ({ propertyID, date }) =>
      run(() => registry.resolve(propertyID).get("getDashboard", { propertyID, date })),
  );

  server.tool(
    "list_reservations",
    "List reservations with optional filters (Cloudbeds getReservations).",
    {
      propertyID,
      status: z
        .enum([
          "confirmed",
          "not_confirmed",
          "canceled",
          "checked_in",
          "checked_out",
          "no_show",
        ])
        .optional()
        .describe("Reservation status filter"),
      checkInFrom: z.string().optional().describe("Arrivals from YYYY-MM-DD"),
      checkInTo: z.string().optional().describe("Arrivals to YYYY-MM-DD"),
      checkOutFrom: z.string().optional().describe("Departures from YYYY-MM-DD"),
      checkOutTo: z.string().optional().describe("Departures to YYYY-MM-DD"),
      firstName: z.string().optional().describe("Filter by primary guest first name"),
      lastName: z.string().optional().describe("Filter by primary guest last name"),
      includeGuestsDetails: z
        .boolean()
        .optional()
        .describe("Include guest details in each reservation"),
      pageNumber: z.number().int().optional().describe("Page number (1-based)"),
      pageSize: z.number().int().max(100).optional().describe("Results per page (max 100)"),
    },
    (args) => run(() => registry.resolve(args.propertyID).get("getReservations", args)),
  );

  server.tool(
    "get_reservation",
    "Get full details for a single reservation (Cloudbeds getReservation).",
    {
      propertyID,
      reservationID: z.string().describe("Cloudbeds reservation ID"),
    },
    ({ propertyID, reservationID }) =>
      run(() =>
        registry.resolve(propertyID).get("getReservation", { propertyID, reservationID }),
      ),
  );

  server.tool(
    "list_guests",
    "List guests, optionally filtered by status and dates (Cloudbeds getGuestList).",
    {
      propertyID,
      status: z.string().optional().describe("Reservation status filter (e.g. checked_in)"),
      checkInFrom: z.string().optional().describe("From YYYY-MM-DD"),
      checkInTo: z.string().optional().describe("To YYYY-MM-DD"),
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(100).optional(),
    },
    ({ propertyID, ...rest }) =>
      run(() =>
        registry.resolve(propertyID).get("getGuestList", { propertyIDs: propertyID, ...rest }),
      ),
  );

  server.tool(
    "get_guest",
    "Get a single guest record (Cloudbeds getGuest).",
    { propertyID, guestID: z.string().describe("Cloudbeds guest ID") },
    ({ propertyID, guestID }) =>
      run(() => registry.resolve(propertyID).get("getGuest", { propertyID, guestID })),
  );

  server.tool(
    "get_availability",
    "Get available room types and counts for a date range (Cloudbeds getAvailableRoomTypes). rooms, adults and children are required.",
    {
      propertyID,
      startDate: z.string().describe("Check-in date YYYY-MM-DD"),
      endDate: z.string().describe("Check-out date YYYY-MM-DD"),
      rooms: z.number().int().describe("Number of rooms requested"),
      adults: z.number().int().describe("Number of adults"),
      children: z.number().int().describe("Number of children (0 if none)"),
      promoCode: z.string().optional().describe("Promotional code"),
      detailedRates: z.boolean().optional().describe("Include detailed rate breakdown"),
    },
    ({ propertyID, ...rest }) =>
      run(() =>
        registry
          .resolve(propertyID)
          .get("getAvailableRoomTypes", { propertyIDs: propertyID, ...rest }),
      ),
  );

  server.tool(
    "list_room_types",
    "List room types and their configuration (Cloudbeds getRoomTypes).",
    { propertyID },
    ({ propertyID }) =>
      run(() => registry.resolve(propertyID).get("getRoomTypes", { propertyIDs: propertyID })),
  );

  server.tool(
    "list_rooms",
    "List physical rooms and their status (Cloudbeds getRooms). If startDate/endDate are given, only unassigned rooms in that range are returned.",
    {
      propertyID,
      roomTypeID: z.string().optional().describe("Filter by room type ID(s)"),
      startDate: z.string().optional().describe("Stay start YYYY-MM-DD (requires endDate)"),
      endDate: z.string().optional().describe("Stay end YYYY-MM-DD (requires startDate)"),
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().optional(),
    },
    ({ propertyID, ...rest }) =>
      run(() =>
        registry.resolve(propertyID).get("getRooms", { propertyIDs: propertyID, ...rest }),
      ),
  );

  server.tool(
    "get_rate_plans",
    "List rate plans for a property/date range (Cloudbeds getRatePlans).",
    {
      propertyID,
      startDate: z.string().optional().describe("From YYYY-MM-DD"),
      endDate: z.string().optional().describe("To YYYY-MM-DD"),
    },
    ({ propertyID, ...rest }) =>
      run(() =>
        registry.resolve(propertyID).get("getRatePlans", { propertyIDs: propertyID, ...rest }),
      ),
  );

  server.tool(
    "list_reservations_with_rates",
    "List reservations with booked-rate, source, and transaction detail (Cloudbeds getReservationsWithRateDetails).",
    {
      propertyID,
      reservationID: z
        .string()
        .optional()
        .describe("Reservation ID(s), comma-separated, to scope results"),
      resultsFrom: z.string().optional().describe("Booking-date lower bound (datetime)"),
      resultsTo: z.string().optional().describe("Booking-date upper bound (datetime)"),
    },
    (args) =>
      run(() =>
        registry.resolve(args.propertyID).get("getReservationsWithRateDetails", args),
      ),
  );

  /* ------------------------------------------------------------ write tools */

  if (!allowWrites) return;

  server.tool(
    "post_reservation_note",
    "Add a note to a reservation (Cloudbeds postReservationNote). WRITE — modifies the PMS.",
    {
      propertyID,
      reservationID: z.string().describe("Cloudbeds reservation ID"),
      reservationNote: z.string().describe("Note text to append"),
    },
    ({ propertyID, reservationID, reservationNote }) =>
      run(() =>
        registry.resolve(propertyID).post("postReservationNote", {
          propertyID,
          reservationID,
          reservationNote,
        }),
      ),
  );

  server.tool(
    "post_payment",
    "Record a payment against a reservation (Cloudbeds postPayment). WRITE — modifies the PMS.",
    {
      propertyID,
      reservationID: z.string().describe("Cloudbeds reservation ID"),
      amount: z.number().describe("Payment amount"),
      type: z
        .string()
        .describe("Payment method (property-specific; from getPaymentMethods), e.g. credit, cash, check"),
      cardType: z
        .string()
        .optional()
        .describe('Required when type=credit, e.g. "visa", "master", "amex"'),
      description: z.string().optional().describe("Note added to the payment"),
    },
    (args) => run(() => registry.resolve(args.propertyID).post("postPayment", args)),
  );

  server.tool(
    "put_reservation_status",
    "Change a reservation's status, e.g. check in/out or cancel (Cloudbeds putReservation). WRITE — modifies the PMS.",
    {
      propertyID,
      reservationID: z.string().describe("Cloudbeds reservation ID"),
      status: z
        .enum([
          "confirmed",
          "not_confirmed",
          "canceled",
          "checked_in",
          "checked_out",
          "no_show",
        ])
        .describe("New reservation status"),
    },
    (args) => run(() => registry.resolve(args.propertyID).post("putReservation", args)),
  );
}
