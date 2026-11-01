export interface HelpArticle {
  id: string;
  section: string;
  question: string;
  answer: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  { id: 'find', section: 'Commutes & matching', question: 'How do I find a commute match?', answer: 'On Home, choose a date and select To Campus or Return Home. Check the schedule shown, then tap Find matches. Results depend on your commute for that date: drivers see potential passengers, riders see drivers, and Either can see both. Review the times, route and gas share before sending a request.' },
  { id: 'none', section: 'Commutes & matching', question: 'Why are there no matches?', answer: 'A match needs compatible schedules, a feasible route and available seats. Check your date, direction, saved commute and discovery setting. For a return trip, save a campus departure time. Blocked commuters do not appear. A search can also be incomplete or temporarily unavailable; check the notice above the results.' },
  { id: 'off', section: 'Commutes & matching', question: 'What if I am not commuting that day?', answer: 'Open the calendar and choose another date, or adjust the selected day. A date with no saved commute does not run a search. Your account role and any change you make for that date determine whether you drive, ride or can do either.' },
  { id: 'return', section: 'Commutes & matching', question: 'Can I book a ride to campus and a ride home?', answer: 'Yes. Trips to campus and return trips have separate requests, so you can confirm both on the same date. Switch between To Campus and Return Home to search or review each direction. Accepting one direction does not confirm the other.' },
  { id: 'request', section: 'Requests & rides', question: 'When is a ride confirmed?', answer: 'A sent request is pending until the other person accepts it. Messages alone do not confirm a ride. Once accepted, the ride appears in your trip details and the request card updates in the conversation. If several requests need your response, swipe between them before accepting or declining.' },
  { id: 'cancel', section: 'Requests & rides', question: 'How do I cancel a ride?', answer: 'Open the confirmed ride, choose Cancel Ride, enter a reason and confirm. The other participant receives the cancellation reason in your conversation. Their request card updates and the reserved seats are released. A pending request can be withdrawn from its request details. Finished or settled rides cannot be cancelled.' },
  { id: 'change', section: 'Requests & rides', question: 'Can I change a confirmed ride?', answer: 'Open the ride details or trip drawer in chat and propose a trip change. You can request a new departure time, pickup label or both, with a note. The original agreement stays in effect until the other person accepts. Pickup-label changes do not move the map pin or recalculate the route; confirm the meeting point in chat.' },
  { id: 'seats', section: 'Requests & rides', question: 'Can a driver accept more than one passenger?', answer: 'Yes, while seats remain available. Home shows the driver’s remaining capacity and a Find matches button. Review the proposed trip before accepting another passenger. Cancelling one passenger’s ride releases their seats without cancelling the driver’s other bookings.' },
  { id: 'history', section: 'Messages & gas shares', question: 'What happens to chat when we arrange another ride?', answer: 'Your conversation history stays in the same chat. New ride requests, price proposals and trip-change proposals appear as separate cards in the conversation. Their status updates in place, so you can distinguish an earlier agreement from a new request.' },
  { id: 'price', section: 'Messages & gas shares', question: 'How do gas shares and price changes work?', answer: 'Review the proposed gas share before accepting a ride. A later price change requires the other participant’s approval; the previously agreed price stays in place until then. Seawolf Rides records the agreement and settlement. Payments take place in the payment app you choose, outside Seawolf Rides.' },
  { id: 'eta', section: 'Messages & gas shares', question: 'Are travel times guaranteed?', answer: 'No. Routes and arrival times are estimates. Traffic-aware estimates are identified when available; static road estimates do not include live traffic. Check your trip details and allow extra time. Opening Maps hands navigation over to that app.' },
  { id: 'block', section: 'Account & safety', question: 'How do I block or report a commuter?', answer: 'Open their public profile to block them or report misconduct. Blocking prevents messaging and removes the pair from matching. Manage your list under Account → Blocked people. Safety reports go to the project team for review; submitting one does not automatically cancel a ride or contact emergency services.' },
  { id: 'contact', section: 'Account & safety', question: 'Who can see my emergency contact?', answer: 'Other commuters cannot see your emergency contact. You can save, update or remove it under Account → Emergency contact. Call and Text open your device’s phone or messaging app. The app does not send automatic alerts or share your trip with the contact.' },
  { id: 'data', section: 'Account & safety', question: 'How do I request help with my account or data?', answer: 'Go to Account → Report a problem and choose Account or privacy. Describe the request and keep the reference number after submission. Account deletion is handled by the project team; the app does not currently offer automatic account deletion. Do not include passwords, payment details or exact addresses.' },
];

export function searchHelp(query: string): HelpArticle[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return HELP_ARTICLES.filter((article) => {
    const text = `${article.section} ${article.question} ${article.answer}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
