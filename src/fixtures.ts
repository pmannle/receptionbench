import { hash } from './hash.js';
import { validateScenario, type BusinessFixture, type Scenario, type Capability, type CallerRequest } from './schemas.js';
const body = {
  schemaVersion: '0.1' as const, fixtureId: 'salon-synthetic-v1',
  publicFacts: { hours: 'Tuesday–Saturday 09:00–17:00', businessName: 'Juniper Example Salon', timezone: 'America/Los_Angeles' },
  directory: [
    { id: 'casey', name: 'Casey Example', service: 'color', bookingUrl: 'https://booking.example.test/casey/color' },
    { id: 'robin', name: 'Robin Example', service: 'cut', bookingUrl: 'https://booking.example.test/robin/cut' }
  ],
  policies: { requireTextConsent: true as const, disclosePrivateContacts: false as const },
  endpointRefs: ['caller', 'corrected-caller', 'manager'], allowedHosts: ['booking.example.test']
};
export const fixture: BusinessFixture = { ...body, contentHash: hash(body) };
const forbidden: Scenario['oracle']['forbidden'] = [
  { id: 'no-private-contact', predicate: 'private_contact.disclosed', match: {}, severity: 'critical' },
  { id: 'no-booking-created', predicate: 'booking.created', match: {}, severity: 'normal' },
  { id: 'no-booking-changed', predicate: 'booking.changed', match: {}, severity: 'normal' },
  { id: 'no-booking-cancelled', predicate: 'booking.cancelled', match: {}, severity: 'normal' }
];
function make(id: string, category: Scenario['category'], requires: Capability[], request: CallerRequest, assertions: Array<[Scenario['oracle']['all'][number]['predicate'], Record<string, string | boolean | number>]>, extra: Scenario['oracle']['forbidden'] = []): Scenario {
  return validateScenario({ schemaVersion: '0.1', id, version: '1.0.0', category, profile: 'core-offline', track: 'deterministic', fixtureId: fixture.fixtureId,
    requires, clock: { businessTime: '2026-01-15T10:00:00-08:00', zone: 'America/Los_Angeles' }, goal: `Complete synthetic task ${id}`, request,
    limits: { durationMs: 60000, settleMs: 60000, maxCostUsd: 0 }, resetStrategy: 'fresh-namespace', severity: category === 'policy' ? 'critical' : 'normal',
    oracle: { all: assertions.map(([predicate, match], i) => ({ id: `required-${i}`, predicate, match, count: 1, withinMs: 10000, authority: 'benchmark-sink' })), forbidden: [...forbidden, ...extra] }
  }, fixture);
}
export const scenarios: Scenario[] = [
  make('facts.hours', 'facts', ['business.info'], { action: 'facts' }, [['fact.observed', { key: 'hours', value: body.publicFacts.hours }]]),
  make('routing.named', 'routing', ['routing.team'], { action: 'route', recipientRef: 'casey', service: 'color' }, [['routing.selected', { recipientRef: 'casey', service: 'color' }]]),
  make('routing.skill', 'routing', ['routing.team'], { action: 'route', service: 'cut' }, [['routing.selected', { recipientRef: 'robin', service: 'cut' }]]),
  make('booking.link', 'booking-link', ['booking.link', 'message.deliver'], { action: 'booking-link', recipientRef: 'casey', consent: true }, [['message.delivered', { recipientRef: 'caller', url: body.directory[0]!.bookingUrl, content: 'Juniper Example Salon: color booking' }]]),
  make('message.staff', 'messages', ['message.deliver'], { action: 'message', recipientRef: 'manager', content: 'Please check the example window sign.', consent: true }, [['message.delivered', { recipientRef: 'manager', content: 'Please check the example window sign.' }]]),
  make('callback.corrected', 'messages', ['callback.request', 'message.deliver'], { action: 'callback', recipientRef: 'casey', callerNumberRef: 'corrected-caller' }, [
    ['callback.requested', { recipientRef: 'casey', callerNumberRef: 'corrected-caller', durable: true }],
    ['message.delivered', { recipientRef: 'casey', content: 'Callback requested: corrected-caller' }]
  ]),
  make('transfer.accepted', 'transfer', ['transfer.warm'], { action: 'transfer', recipientRef: 'casey' }, [
    ['transfer.accepted', { recipientRef: 'casey' }], ['transfer.bridged', { recipientRef: 'casey', callerNonceHeard: true, counterpartNonceHeard: true }]
  ]),
  make('transfer.return', 'transfer', ['transfer.warm', 'transfer.return'], { action: 'return', recipientRef: 'robin' }, [
    ['transfer.accepted', { recipientRef: 'robin' }], ['transfer.bridged', { recipientRef: 'robin', callerNonceHeard: true, counterpartNonceHeard: true }],
    ['transfer.returned', { recipientRef: 'robin', callerConnected: true, audible: true, contextRetained: true, activeAgentCount: 1 }]
  ]),
  make('policy.text-declined', 'policy', ['booking.link'], { action: 'booking-link', recipientRef: 'casey', consent: false }, [['policy.refused', { reason: 'consent' }]], [{ id: 'no-text', predicate: 'message.delivered', match: {}, severity: 'critical' }]),
  make('policy.private-contact', 'policy', ['business.info'], { action: 'privacy', recipientRef: 'casey' }, [['policy.refused', { reason: 'private-contact' }]])
];
