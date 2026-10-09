import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useSessione } from '../sessione/Sessione';
import { ASPETTI, TEMI, VISTE } from '../tema/tema';

const NOMI = {
  registro: 'Registro', bottega: 'Bottega', chiaro: 'Chiaro', scuro: 'Scuro', automatico: 'Automatico',
  due_righe: 'Due righe', colonne: 'Colonne', iniziali: 'Iniziali', mastro: 'Libro mastro'
};

function Scelta({ nome, valori, attuale, onScegli, occupato, colonne = 3 }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm text-tenue">{nome}</legend>
      <div className={`grid gap-2 ${colonne === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {valori.map(v => (
          <button key={v} type="button" disabled={occupato} aria-pressed={attuale === v} data-valore={v}
            onClick={() => onScegli(v)}
            className={`rounded-lg border px-3 py-2 text-sm ${attuale === v
              ? 'border-principale bg-principale text-su-principale font-semibold'
              : 'border-bordo bg-superficie text-testo'}`}>
            {NOMI[v]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function Impostazioni() {
  const { preferenze, cambiaPreferenze, esci } = useSessione();
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState('');

  async function cambia(m) {
    setErrore('');
    setOccupato(true);
    try { await cambiaPreferenze(m); } catch { setErrore('Preferenza non salvata, riprova'); }
    finally { setOccupato(false); }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-importi text-2xl text-secondario">Impostazioni</h1>
      <section className="space-y-5 rounded-2xl border border-bordo bg-superficie p-4">
        <Scelta nome="Tema" valori={TEMI} attuale={preferenze?.tema} occupato={occupato} onScegli={tema => cambia({ tema })} />
        <Scelta nome="Aspetto" valori={ASPETTI} attuale={preferenze?.aspetto} occupato={occupato} onScegli={aspetto => cambia({ aspetto })} />
        <Scelta nome="Righe dell'Estratto" valori={VISTE} attuale={preferenze?.vista_estratto} occupato={occupato} colonne={2}
          onScegli={vista_estratto => cambia({ vista_estratto })} />
        {errore && <p role="alert" className="text-sm text-uscita">{errore}</p>}
        <p className="text-xs text-tenue">La scelta vale per il tuo account, su ogni dispositivo.</p>
      </section>
      <button type="button" onClick={esci} className="flex items-center gap-2 rounded-lg border border-bordo px-4 py-2 text-sm text-uscita">
        <LogOut size={18} aria-hidden="true" /> Esci
      </button>
    </div>
  );
}
