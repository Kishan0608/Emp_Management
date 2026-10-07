import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';

import { api } from '@/lib/api';
import type { Organization } from '@/lib/types';
import { useAuth } from './AuthProvider';

const STORAGE_KEY = '@boss_selected_org_id';

export interface OrganizationContextValue {
  organizations: Organization[];
  selectedOrg: Organization | null;
  selectedOrgId: string | null;
  setSelectedOrg: (org: Organization | null) => Promise<void>;
  loading: boolean;
  refreshOrganizations: () => Promise<void>;
}

const defaultValue: OrganizationContextValue = {
  organizations: [],
  selectedOrg: null,
  selectedOrgId: null,
  setSelectedOrg: async () => {},
  loading: false,
  refreshOrganizations: async () => {},
};

const OrganizationContext = createContext<OrganizationContextValue>(defaultValue);

const asOrganization = (o: { id: string; name: string }): Organization => ({ id: o.id, name: o.name, is_active: true, created_at: '' });

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { session, ctx } = useAuth();
  // The signed-in person's own company, from my_context.
  const ownOrg = ctx?.organization ?? null;
  const ownOrgId = ctx?.user.organization_id ?? ownOrg?.id ?? null;

  const [fetched, setFetched] = useState<Organization[] | null>(null);
  const [selectedOrgObj, setSelectedOrgObj] = useState<Organization | null>(null);
  const [pickedOrgId, setPickedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The full list once loaded, always including the person's own company.
  const organizations = useMemo<Organization[]>(() => {
    const own = ownOrg ? asOrganization(ownOrg) : null;
    if (!fetched) return own ? [own] : [];
    if (own && !fetched.some((o) => o.id === own.id)) return [own, ...fetched];
    return fetched;
  }, [fetched, ownOrg]);

  // No choice yet (or the old "ALL" value): fall back to the person's own company.
  const selectedOrgId = pickedOrgId && pickedOrgId !== 'ALL' ? pickedOrgId : (ownOrgId ?? pickedOrgId);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.organizations();
      if (Array.isArray(list)) setFetched(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the saved company choice on boot / sign-in without overwriting
  useEffect(() => {
    if (!session) {
      return;
    }
    let active = true;

    async function init() {
      let savedId: string | null = null;
      try {
        savedId = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedId && savedId !== 'ALL' && active) {
          setPickedOrgId(savedId);
        }
      } catch {}

      const list = await loadOrganizations();
      if (!active) return;

      if (savedId && savedId !== 'ALL') {
        const found = (list || []).find((o) => o.id === savedId);
        if (found) {
          setSelectedOrgObj(found);
          setPickedOrgId(savedId);
          return;
        }
      }

      if (!savedId) {
        const defaultId = ownOrgId || list?.[0]?.id || null;
        setPickedOrgId(defaultId);
        const foundDefault = (list || []).find((o) => o.id === defaultId);
        if (foundDefault) {
          setSelectedOrgObj(foundDefault);
        }
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [session, ownOrgId, loadOrganizations]);

  const setSelectedOrg = useCallback(async (org: Organization | null) => {
    setSelectedOrgObj(org);
    setPickedOrgId(org ? org.id : null);
    try {
      if (org) {
        await AsyncStorage.setItem(STORAGE_KEY, org.id);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, []);

  const selectedOrg = useMemo<Organization | null>(() => {
    const orgId = selectedOrgId || selectedOrgObj?.id || ownOrgId;
    if (orgId) {
      const found = organizations.find((o) => o.id === orgId);
      if (found) return found;
      if (ownOrg && ownOrg.id === orgId) return asOrganization(ownOrg);
    }
    if (selectedOrgObj) return selectedOrgObj;
    if (organizations.length > 0) return organizations[0];
    return ownOrg ? asOrganization(ownOrg) : null;
  }, [selectedOrgObj, selectedOrgId, organizations, ownOrgId, ownOrg]);

  const refreshOrganizations = useCallback(async () => {
    await loadOrganizations();
  }, [loadOrganizations]);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations,
      selectedOrg,
      selectedOrgId,
      setSelectedOrg,
      loading,
      refreshOrganizations,
    }),
    [organizations, selectedOrg, selectedOrgId, setSelectedOrg, loading, refreshOrganizations],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
