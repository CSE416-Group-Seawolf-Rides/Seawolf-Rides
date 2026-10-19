# Gas shares (price + tally)

Riders chip in a fair share of what the drive costs: fuel, car wear, and a small pickup fee. It's cost sharing, not a fare: no surge,
no profit, and money never moves through Seawolf Rides. The app shows the price, keeps a
weekly tally per person, and opens Venmo or PayPal (or copies a Zelle contact) to settle.

## How a price is calculated

`mobile/src/payments/pricing.ts` (shared by the app and Functions):

```
price = $1.00 pickup + (rider's miles × cost per mile) ÷ 2 + pickup detour miles × cost per mile
cost per mile = fuel (gas ÷ MPG, or electricity ÷ mi/kWh) + $0.25 car wear
```

- **Rider's miles:** the shared route distance × the fraction of the trip the rider is aboard.
  **Detour miles:** `driverExtraDistanceMeters`. Both come from matching; users enter nothing.
- **Fuel:** typical efficiencies (gas 28 mpg, hybrid 48 mpg, EV 3.5 mi/kWh) unless the driver sets
  their own in **Account → Fuel efficiency**.
- **Why it isn't fuel-only:** fuel alone made rides about $1, too little for anyone to stop and pick
  someone up.
  - The $0.25/mi covers tires, maintenance and depreciation. With fuel it's still only about half the
    IRS 76¢ full cost of driving.
  - The $1.00 pickup fee pays for the stop.
- **Bounds:**
  - **Minimum $3.00**, about a Zone 10 LIRR trip on a weekly pass ($33 ÷ 10, Jan 2026 chart).
  - **Never above** $1.00 + the IRS rate × (rider miles ÷ 2 + detour).
  - Rounded to the nearest $0.25.
- **Examples** (gas car):

  | Trip | Price | LIRR comparison |
  |---|---|---|
  | Centereach → SBU | $3.00 | No station |
  | Lake Ronkonkoma → SBU | $3.75 | Needs a branch change |
  | Douglaston → SBU | $10.00 | $11.28 on a Zone 3–10 weekly pass; $16–21.50 one-way |
- **Locked when a request is sent** (`rideRequests/{id}.price`). Weekly price changes and MPG edits
  only affect new requests, never agreed rides.

## Drivers can adjust or waive

A driver sets one adjustment per rider: **Free · −50% · −25% · Suggested · +10% · +25%**
(`PRICE_ADJUSTMENTS`). It's reached from that rider's row in Rides → Gas shares, or from the
carpool screen.

- **Why these limits:**
  - **+25% max.** The suggestion covers fuel and wear at the weekly average. +25% leaves room for prices
    rising mid-week, idling and worse-than-listed MPG, while staying well under the IRS cap, so it
    stays a cost share. The cap still applies after a raise, and adjusted prices round down.
  - **Lowering is generous**, so it gets more room. Below half, "Free" is the honest option.
- **Fixed steps**, so prices stay comparable and never land on odd amounts.
- **Only the driver adjusts.** Riders never change prices, which avoids haggling. The saved preference is labeled for new requests; saving confirms the preference and how many unpaid rides were lowered.
- **Changes only go in the rider's favor:** a lower price also applies to that rider's unpaid
  accepted and pending rides; a higher one only applies to new requests.
- **Riders see the change:** "Alex lowered it from $1.00", "Alex covers the gas", or
  "includes Alex's +25% (suggested $1.00)".

Stored at `priceAdjustments/{driverId}_{riderId}`. Each price records `suggestedCents` and
`adjustment`, so re-adjusting starts from the suggestion and never compounds.

## Weekly fuel prices

`pricing/fuel` holds NY regular gas (EIA series `EMM_EPMR_PTE_SNY_DPG`, weekly) and NY home
electricity. Until that document exists, the defaults in `pricing.ts` are used: $4.353/gal
(week of Oct 12, 2026) and 29.9¢/kWh (July 2026).

`refreshFuelPrices` (`functions/src/payments.ts`) runs every Tuesday 6:00 AM New York time when
deployed and writes the newest EIA price. It needs a free key from
https://www.eia.gov/opendata/register.php set as `EIA_API_KEY` for Functions. Without a key it
does nothing and the defaults stay. Scheduled functions don't fire on their own in the local
emulator, so the demo uses the defaults unless `pricing/fuel` is written.

## Settling up

- **Rides → Gas shares** lists one balance per person with something to settle.
  - If two people take turns driving, each payment direction has its own balance so a
    settlement only includes rides with the same rider and driver.
  - Rides become "due" after both agreed campus arrival times, including rides today.
  - All future accepted rides are shown as upcoming, including rides beyond this week. Riders see a disabled Settle up button until a ride finishes.
  - Payments marked sent wait for the driver's "Got it".
  - Each sent payment can be confirmed even while other rides remain unpaid. Only confirmed
    payments count toward the driver's "covered this month" total.
- **Settle up** (riders) opens a sheet with the amount and one row per app the driver accepts.
  - **Venmo** opens `venmo.com/<user>?txn=pay&amount=…&note=…`, a universal link that opens the app.
  - **PayPal** opens `paypal.me/<name>/<amount>USD`.
  - **Zelle** has no public link (it lives in banking apps), so its email or phone is copied.
  - The rider then taps "I sent $X", or "I've already paid" for cash or anything else.
- **Account → How riders pay you** (drivers) stores Venmo, PayPal and Zelle usernames.

## Data and rules

| Path | Who reads | Who writes |
|---|---|---|
| `paymentHandles/{uid}` | Owner only. Riders get a driver's handles through `getPayeeHandles`, which requires an accepted ride together | `savePaymentHandles` |
| `settlements/{id}` | The payer and payee | `recordSettlement` (rider; past, accepted, priced rides only; each ride once via `_settledRequests/{requestId}`), `confirmSettlement` (payee) |
| `pricing/fuel` | Verified students | `refreshFuelPrices` |
| `priceAdjustments/{driverId}_{riderId}` | That driver and rider | `setPriceAdjustment` (driver only, for riders who asked to ride with them) |
| `users/{uid}/vehicles/primary` `fuelType`, `efficiency` | Owner | `saveFuelEfficiency`; `saveVehicleDetails` keeps these fields |

Tests: `mobile/test/payments.test.mjs` (pricing, EIA parsing, handles, links, tally),
`integration/firestore-rules.integration.mjs` (new rules), and `integration/payments.integration.mjs`
(callables, run by `npm run test:matching`).

## Not included

- Parking costs.
- Payment reminders.
- Real money movement (for example Stripe).
