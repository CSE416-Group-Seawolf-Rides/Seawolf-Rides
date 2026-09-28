import { PrototypeConversation } from './types';

// Frontend-only M2 fixtures. None of these values are calculated or persisted.
// Details (spots, times, days) match the ride fixtures so the demo tells one story.
export const conversationFixtures: PrototypeConversation[] = [
  {
    offerId: 'alex',
    preview: {
      id: 'alex-chat',
      participantName: 'Alex',
      commuteLabel: 'Driver · Mon, Wed to Tabler',
      lastMessage: 'See you Monday!',
      timestamp: 'Yesterday',
    },
    messages: [
      {
        id: 'alex-1',
        sender: 'them',
        text: 'Hey! Got your request. Happy to have you on Mondays and Wednesdays.',
        timestamp: '6:02 PM',
      },
      {
        id: 'alex-2',
        sender: 'them',
        text: 'I’ll be at the Macy’s entrance at Smith Haven around 7:55. Gray Civic.',
        timestamp: '6:03 PM',
      },
      {
        id: 'alex-3',
        sender: 'me',
        text: 'Perfect, I’ll be there a few minutes early.',
        timestamp: '6:10 PM',
      },
      {
        id: 'alex-4',
        sender: 'them',
        text: 'See you Monday!',
        timestamp: '6:11 PM',
      },
    ],
  },
  {
    riderId: 'maya',
    preview: {
      id: 'maya-chat',
      participantName: 'Maya',
      commuteLabel: 'Rider · Tue, Thu',
      lastMessage: 'Great, I’ll wait by the bike racks.',
      timestamp: '9:41 AM',
    },
    messages: [
      {
        id: 'maya-1',
        sender: 'them',
        text: 'Thanks for accepting! Is the north lot at Ronkonkoma station okay for pickup?',
        timestamp: '9:30 AM',
      },
      {
        id: 'maya-2',
        sender: 'me',
        text: 'Yep, works for me. I’ll swing by around 8:30.',
        timestamp: '9:38 AM',
      },
      {
        id: 'maya-3',
        sender: 'them',
        text: 'Great, I’ll wait by the bike racks.',
        timestamp: '9:41 AM',
      },
    ],
  },
  {
    preview: {
      id: 'sarah-chat',
      participantName: 'Sarah',
      commuteLabel: 'Past driver',
      lastMessage: 'No problem at all, good luck!',
      timestamp: 'Last week',
    },
    messages: [
      {
        id: 'sarah-1',
        sender: 'me',
        text: 'Hi Sarah, I have to skip tomorrow. My exam got moved to the morning. Sorry for the short notice!',
        timestamp: '8:12 PM',
      },
      {
        id: 'sarah-2',
        sender: 'them',
        text: 'No problem at all, good luck!',
        timestamp: '8:20 PM',
      },
    ],
  },
];
