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

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { session, ctx } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isBoss = ctx?.user.role === 'boss';

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.organizations();
      setOrganizations(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Load saved organization choice on boot / sign-in
  useEffect(() => {
    if (!session) {
      setSelectedOrgId(null);
      return;
    }
    loadOrganizations().then(async (list) => {
      if (isBoss) {
        try {
          const savedId = await AsyncStorage.getItem(STORAGE_KEY);
          if (savedId) {
            const found = list.find((o) => o.id === savedId);
            if (found) {
              setSelectedOrgId(savedId);
              return;
            }
          }
        } catch {}
      } else if (ctx?.user.organization_id) {
        setSelectedOrgId(ctx.user.organization_id);
      }
    });
  }, [session, isBoss, ctx?.user.organization_id, loadOrganizations]);

  const setSelectedOrg = useCallback(
    async (org: Organization | null) => {
      setSelectedOrgId(org ? org.id : null);
      try {
        if (org) {
          await AsyncStorage.setItem(STORAGE_KEY, org.id);
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    },
    [],
  );

  const selectedOrg = useMemo(() => {
    if (!selectedOrgId) return null;
    return organizations.find((o) => o.id === selectedOrgId) ?? null;
  }, [organizations, selectedOrgId]);

  const value = useMemo(
    () => ({
      organizations,
      selectedOrg,
      selectedOrgId,
      setSelectedOrg,
      loading,
      refreshOrganizations: async () => {
        await loadOrganizations();
      },
    }),
    [organizations, selectedOrg, selectedOrgId, setSelectedOrg, loading, loadOrganizations],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const v = useContext(OrganizationContext);
  if (!v) {
    return {
      organizations: [],
      selectedOrg: null,
      selectedOrgId: null,
      setSelectedOrg: async () => {},
      loading: false,
      refreshOrganizations: async () => {},
    };
  }
  return v;
}
