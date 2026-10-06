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

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { session, ctx } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>(() => {
    if (ctx?.organization) {
      return [{ id: ctx.organization.id, name: ctx.organization.name, is_active: true, created_at: '' }];
    }
    return [{ id: '7d6560a3-b9d6-46b5-b8bf-685cf8dce53d', name: 'Shree Karni Fabcom Ltd', is_active: true, created_at: '' }];
  });
  const [selectedOrgObj, setSelectedOrgObj] = useState<Organization | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    ctx?.user.organization_id || ctx?.organization?.id || '7d6560a3-b9d6-46b5-b8bf-685cf8dce53d',
  );
  const [loading, setLoading] = useState(false);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.organizations();
      if (list && Array.isArray(list)) {
        setOrganizations(list);
      }
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync when ctx loads user organization
  useEffect(() => {
    if (ctx?.organization) {
      setOrganizations((prev) => {
        if (prev.some((o) => o.id === ctx.organization!.id)) return prev;
        return [{ id: ctx.organization!.id, name: ctx.organization!.name, is_active: true, created_at: '' }, ...prev];
      });
    }
    if (ctx?.user.organization_id && (!selectedOrgId || selectedOrgId === 'ALL')) {
      setSelectedOrgId(ctx.user.organization_id);
    }
  }, [ctx?.organization, ctx?.user.organization_id, selectedOrgId]);

  // Load saved organization choice on boot / sign-in without overwriting
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
          setSelectedOrgId(savedId);
        }
      } catch {}

      const list = await loadOrganizations();
      if (!active) return;

      if (savedId && savedId !== 'ALL') {
        const found = (list || []).find((o) => o.id === savedId);
        if (found) {
          setSelectedOrgObj(found);
          setSelectedOrgId(savedId);
          return;
        }
      }

      if (!savedId) {
        const defaultId = ctx?.user.organization_id || list?.[0]?.id || '7d6560a3-b9d6-46b5-b8bf-685cf8dce53d';
        setSelectedOrgId(defaultId);
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
  }, [session, ctx?.user.organization_id, loadOrganizations]);

  const setSelectedOrg = useCallback(
    async (org: Organization | null) => {
      setSelectedOrgObj(org);
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

  const selectedOrg = useMemo<Organization>(() => {
    const orgId = selectedOrgId || selectedOrgObj?.id || ctx?.user.organization_id;
    if (orgId) {
      const found = organizations.find((o) => o.id === orgId);
      if (found) return found;
      if (ctx?.organization && ctx.organization.id === orgId) {
        return { id: ctx.organization.id, name: ctx.organization.name, is_active: true, created_at: '' };
      }
    }
    if (selectedOrgObj) {
      return selectedOrgObj;
    }
    if (organizations.length > 0) {
      return organizations[0];
    }
    if (ctx?.organization) {
      return { id: ctx.organization.id, name: ctx.organization.name, is_active: true, created_at: '' };
    }
    return {
      id: '7d6560a3-b9d6-46b5-b8bf-685cf8dce53d',
      name: 'Shree Karni Fabcom Ltd',
      is_active: true,
      created_at: '',
    };
  }, [selectedOrgObj, selectedOrgId, organizations, ctx?.user.organization_id, ctx?.organization]);

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
