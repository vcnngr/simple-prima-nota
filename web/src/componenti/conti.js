import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { registroApi } from '../api/registro';

// Ultimo conto scelto: lo propone il nuovo movimento.
export const CHIAVE_CONTO = 'pn_conto';

export function useConti() {
  const q = useQuery({ queryKey: ['conti'], queryFn: registroApi.conti });
  const [scelto, setScelto] = useState(() => Number(localStorage.getItem(CHIAVE_CONTO)) || null);
  const conti = q.data ?? [];
  const conto = conti.find(c => c.id === scelto) || conti[0] || null;
  const scegli = id => { localStorage.setItem(CHIAVE_CONTO, String(id)); setScelto(id); };
  return { ...q, conti, conto, scegli };
}

export const nomeConto = c => (c ? c.nome_banca + (c.intestatario ? ` · ${c.intestatario}` : '') : '');
