import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = {
  events: {
    query: vi.fn(),
    count: vi.fn(),
    queryAdvanced: vi.fn(),
    countAdvanced: vi.fn(),
    scroll: vi.fn(),
    recommendedActions: vi.fn(),
  },
  customers: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setWhitelists: vi.fn(),
    setAccountWhitelists: vi.fn(),
  },
  users: {
    getMspUser: vi.fn(),
    listPartnerUsers: vi.fn(),
    listByCustomer: vi.fn(),
  },
  devices: {
    listMapped: vi.fn(),
    listUnmapped: vi.fn(),
    listIgnored: vi.fn(),
    listOrganizations: vi.fn(),
  },
  billing: {
    getDetails: vi.fn(),
    listDates: vi.fn(),
  },
  reports: {
    listScheduled: vi.fn(),
    getScheduled: vi.fn(),
    createScheduled: vi.fn(),
    deleteScheduled: vi.fn(),
  },
  partner: {
    getProfile: vi.fn(),
    updateBranding: vi.fn(),
  },
};

vi.mock('../utils/client.js', () => ({
  getClient: () => mockClient,
  getCredentials: () => ({ apiKey: 'test-key' }),
}));

beforeEach(() => vi.clearAllMocks());

// ---- events ----
describe('events domain', () => {
  it('events_query maps snake args to SDK opts and returns data', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([{ id: 'e1' }]);
    const res = await eventsHandler.handleCall('saas_alerts_events_query', {
      customer_id: 'c1', alert_status: 'critical', size: 50, event_type: ['x'],
    });
    expect(mockClient.events.query).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'c1', alertStatus: 'critical', size: 50, eventType: ['x'] })
    );
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('e1');
  });

  it('events_query maps user_email, start_date, end_date to SDK camelCase opts', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([{ id: 'e3' }]);
    await eventsHandler.handleCall('saas_alerts_events_query', {
      user_email: 'user@test.com',
      start_date: '2026-01-01T00:00:00Z',
      end_date: '2026-12-31T23:59:59Z',
    });
    expect(mockClient.events.query).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: 'user@test.com',
        start: '2026-01-01T00:00:00Z',
        end: '2026-12-31T23:59:59Z',
      })
    );
  });

  it('events_query_advanced posts the search request under body, not a bare query', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    // Customer shape: login-failure filter on user.name plus an IP terms agg.
    // The SDK forwards this object as the POST /reports/events/query JSON body.
    const esSearch = {
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { 'user.name': 'user@example.com' } },
            { term: { jointType: 'login.failure' } },
          ],
        },
      },
      aggs: { ips: { terms: { field: 'ip', size: 25 } } },
    };
    mockClient.events.queryAdvanced.mockResolvedValueOnce([{ id: 'e4' }]);
    await eventsHandler.handleCall('saas_alerts_events_query_advanced', { query: esSearch });
    const payload = mockClient.events.queryAdvanced.mock.calls[0][0];
    expect(payload).toEqual({ body: esSearch });
    expect(payload).toHaveProperty('body');
    expect(payload).not.toHaveProperty('query');
    expect(payload.body.query.bool.filter).toEqual(esSearch.query.bool.filter);
  });

  it('events_count_advanced posts the search request under body, not a bare query', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    const esSearch = {
      query: {
        bool: {
          filter: [
            { term: { 'user.name': 'user@example.com' } },
            { term: { jointType: 'login.failure' } },
          ],
        },
      },
    };
    mockClient.events.countAdvanced.mockResolvedValueOnce({ count: 7 });
    await eventsHandler.handleCall('saas_alerts_events_count_advanced', { query: esSearch });
    const payload = mockClient.events.countAdvanced.mock.calls[0][0];
    expect(payload).toEqual({ body: esSearch });
    expect(payload).toHaveProperty('body');
    expect(payload).not.toHaveProperty('query');
  });

  it('events_query empty result is flagged isError', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.query.mockResolvedValueOnce([]);
    const res = await eventsHandler.handleCall('saas_alerts_events_query', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/no events/i);
  });

  it('events_scroll forwards scroll_id', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.scroll.mockResolvedValueOnce({ hits: [{ id: 'e2' }] });
    await eventsHandler.handleCall('saas_alerts_events_scroll', { scroll_id: 'S1' });
    expect(mockClient.events.scroll).toHaveBeenCalledWith('S1');
  });

  it('events_count returns count result', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.count.mockResolvedValueOnce({ count: 42 });
    const res = await eventsHandler.handleCall('saas_alerts_events_count', {});
    expect(mockClient.events.count).toHaveBeenCalled();
    expect(res.isError).toBeFalsy();
  });

  it('recommended_actions empty flags isError', async () => {
    const { eventsHandler } = await import('../domains/events.js');
    mockClient.events.recommendedActions.mockResolvedValueOnce([]);
    const res = await eventsHandler.handleCall('saas_alerts_recommended_actions', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/no recommended actions/i);
  });
});

// ---- customers ----
describe('customers domain', () => {
  it('customers_list returns customers', async () => {
    const { customersHandler } = await import('../domains/customers.js');
    mockClient.customers.list.mockResolvedValueOnce([{ id: 'c1' }]);
    const res = await customersHandler.handleCall('saas_alerts_customers_list', {});
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('c1');
  });

  it('customers_list empty flags isError', async () => {
    const { customersHandler } = await import('../domains/customers.js');
    mockClient.customers.list.mockResolvedValueOnce([]);
    const res = await customersHandler.handleCall('saas_alerts_customers_list', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/no customers/i);
  });

  it('customers_get forwards id', async () => {
    const { customersHandler } = await import('../domains/customers.js');
    mockClient.customers.get.mockResolvedValueOnce({ id: 'c1' });
    await customersHandler.handleCall('saas_alerts_customers_get', { customer_id: 'c1' });
    expect(mockClient.customers.get).toHaveBeenCalledWith('c1');
  });

  it('customers_create forwards body', async () => {
    const { customersHandler } = await import('../domains/customers.js');
    mockClient.customers.create.mockResolvedValueOnce({ id: 'new' });
    await customersHandler.handleCall('saas_alerts_customers_create', { body: { name: 'Test' } });
    expect(mockClient.customers.create).toHaveBeenCalledWith({ name: 'Test' });
  });

  it('customers_delete cancelled when confirm:false', async () => {
    const { customersHandler } = await import('../domains/customers.js');
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: false } })),
    };
    const res = await customersHandler.handleCall(
      'saas_alerts_customers_delete',
      { customer_id: 'c1' },
      { server }
    );
    expect(mockClient.customers.delete).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('cancelled');
  });

  it('customers_delete proceeds when confirm:true', async () => {
    const { customersHandler } = await import('../domains/customers.js');
    mockClient.customers.delete.mockResolvedValueOnce({ success: true });
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: true } })),
    };
    const res = await customersHandler.handleCall(
      'saas_alerts_customers_delete',
      { customer_id: 'c1' },
      { server }
    );
    expect(mockClient.customers.delete).toHaveBeenCalledWith('c1');
    expect(res.isError).toBeFalsy();
  });

  it('customers_delete proceeds when no elicitation server (fail-open)', async () => {
    const { customersHandler } = await import('../domains/customers.js');
    mockClient.customers.delete.mockResolvedValueOnce({ success: true });
    const res = await customersHandler.handleCall('saas_alerts_customers_delete', { customer_id: 'c1' });
    expect(mockClient.customers.delete).toHaveBeenCalledWith('c1');
    expect(res.isError).toBeFalsy();
  });
});

// ---- users ----
describe('users domain', () => {
  it('users_get_msp calls getMspUser', async () => {
    const { usersHandler } = await import('../domains/users.js');
    mockClient.users.getMspUser.mockResolvedValueOnce({ email: 'msp@test.com' });
    const res = await usersHandler.handleCall('saas_alerts_users_get_msp', {});
    expect(mockClient.users.getMspUser).toHaveBeenCalled();
    expect(res.isError).toBeFalsy();
  });

  it('users_list_partner returns users', async () => {
    const { usersHandler } = await import('../domains/users.js');
    mockClient.users.listPartnerUsers.mockResolvedValueOnce([{ id: 'u1' }]);
    const res = await usersHandler.handleCall('saas_alerts_users_list_partner', {});
    expect(res.isError).toBeFalsy();
  });

  it('users_list_by_customer forwards customerId', async () => {
    const { usersHandler } = await import('../domains/users.js');
    mockClient.users.listByCustomer.mockResolvedValueOnce([{ id: 'u1' }]);
    await usersHandler.handleCall('saas_alerts_users_list_by_customer', { customer_id: 'c1' });
    expect(mockClient.users.listByCustomer).toHaveBeenCalledWith('c1');
  });
});

// ---- devices ----
describe('devices domain', () => {
  it('devices_list_mapped forwards orgIds', async () => {
    const { devicesHandler } = await import('../domains/devices.js');
    mockClient.devices.listMapped.mockResolvedValueOnce([{ id: 'd1' }]);
    await devicesHandler.handleCall('saas_alerts_devices_list_mapped', { organization_ids: ['org1'] });
    expect(mockClient.devices.listMapped).toHaveBeenCalledWith(['org1']);
  });

  it('devices_list_unmapped forwards opts', async () => {
    const { devicesHandler } = await import('../domains/devices.js');
    mockClient.devices.listUnmapped.mockResolvedValueOnce([{ id: 'd2' }]);
    await devicesHandler.handleCall('saas_alerts_devices_list_unmapped', {
      organization_ids: ['org1'], confidence: 0.8, only_with_suggestions: true,
    });
    expect(mockClient.devices.listUnmapped).toHaveBeenCalledWith(
      expect.objectContaining({ organizationIds: ['org1'], confidence: 0.8, onlyWithSuggestions: true })
    );
  });

  it('devices_list_orgs returns organizations', async () => {
    const { devicesHandler } = await import('../domains/devices.js');
    mockClient.devices.listOrganizations.mockResolvedValueOnce([{ id: 'o1' }]);
    const res = await devicesHandler.handleCall('saas_alerts_devices_list_orgs', {});
    expect(res.isError).toBeFalsy();
  });

  it('devices_list_mapped empty flags isError', async () => {
    const { devicesHandler } = await import('../domains/devices.js');
    mockClient.devices.listMapped.mockResolvedValueOnce([]);
    const res = await devicesHandler.handleCall('saas_alerts_devices_list_mapped', { organization_ids: ['org1'] });
    expect(res.isError).toBe(true);
  });
});

// ---- billing ----
describe('billing domain', () => {
  it('billing_get_details forwards date', async () => {
    const { billingHandler } = await import('../domains/billing.js');
    mockClient.billing.getDetails.mockResolvedValueOnce({ total: 100 });
    await billingHandler.handleCall('saas_alerts_billing_get_details', { billing_date: '2026-01-01' });
    expect(mockClient.billing.getDetails).toHaveBeenCalledWith('2026-01-01');
  });

  it('billing_list_dates returns dates', async () => {
    const { billingHandler } = await import('../domains/billing.js');
    mockClient.billing.listDates.mockResolvedValueOnce(['2026-01-01']);
    const res = await billingHandler.handleCall('saas_alerts_billing_list_dates', {});
    expect(res.isError).toBeFalsy();
  });
});

// ---- reports ----
describe('reports domain', () => {
  it('reports_list_scheduled returns reports', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    mockClient.reports.listScheduled.mockResolvedValueOnce([{ id: 'r1' }]);
    const res = await reportsHandler.handleCall('saas_alerts_reports_list_scheduled', {});
    expect(res.isError).toBeFalsy();
  });

  it('reports_delete_scheduled cancelled when confirm:false', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: false } })),
    };
    const res = await reportsHandler.handleCall(
      'saas_alerts_reports_delete_scheduled',
      { report_id: 'r1' },
      { server }
    );
    expect(mockClient.reports.deleteScheduled).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('cancelled');
  });

  it('reports_create_scheduled forwards body', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    mockClient.reports.createScheduled.mockResolvedValueOnce({ id: 'r2' });
    await reportsHandler.handleCall('saas_alerts_reports_create_scheduled', { body: { name: 'Monthly' } });
    expect(mockClient.reports.createScheduled).toHaveBeenCalledWith({ name: 'Monthly' });
  });
});

// ---- partner ----
describe('partner domain', () => {
  it('partner_get_profile returns profile', async () => {
    const { partnerHandler } = await import('../domains/partner.js');
    mockClient.partner.getProfile.mockResolvedValueOnce({ name: 'WYRE' });
    const res = await partnerHandler.handleCall('saas_alerts_partner_get_profile', {});
    expect(res.isError).toBeFalsy();
  });

  it('partner_update_branding forwards body', async () => {
    const { partnerHandler } = await import('../domains/partner.js');
    mockClient.partner.updateBranding.mockResolvedValueOnce({ success: true });
    await partnerHandler.handleCall('saas_alerts_partner_update_branding', { body: { logo: 'url' } });
    expect(mockClient.partner.updateBranding).toHaveBeenCalledWith({ logo: 'url' });
  });

  it('partner_update_branding cancelled when confirm:false', async () => {
    const { partnerHandler } = await import('../domains/partner.js');
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: false } })),
    };
    const res = await partnerHandler.handleCall(
      'saas_alerts_partner_update_branding',
      { body: { logo: 'url' } },
      { server }
    );
    expect(mockClient.partner.updateBranding).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
  });
});
