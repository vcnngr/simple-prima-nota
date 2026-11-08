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

// Conti scelti nel Registro (U7b): nell'indirizzo come "3,5,9" (?conto=), in
// ordine e senza doppioni; vuoto = tutti. Un solo id resta compatibile coi link
// vecchi (?conto=5).
export const ELENCO_CONTI = /^[1-9]\d{0,9}(,[1-9]\d{0,9}){0,49}$/;
export const contiScelti = v => (v && ELENCO_CONTI.test(v) ? [...new Set(v.split(','))].sort((a, b) => a - b) : []);
export const scriviConti = ids => (ids.length ? [...new Set(ids.map(String))].sort((a, b) => a - b).join(',') : null);
// Aggiunge o toglie un conto dalla scelta.
export const alternaConto = (ids, id) => scriviConti(ids.includes(String(id)) ? ids.filter(x => x !== String(id)) : [...ids, String(id)]);
