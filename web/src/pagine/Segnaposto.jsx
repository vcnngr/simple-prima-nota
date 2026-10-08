// Pagine che arrivano in U5 (utente) e U6 (studio). Intanto mostrano i token del
// tema attivo: e' il campionario con cui si verificano i due temi.
const CAMPIONI = [
  ['principale', 'bg-principale'], ['secondario', 'bg-secondario'], ['accento', 'bg-accento'],
  ['entrata', 'bg-entrata'], ['uscita', 'bg-uscita'], ['da chiarire', 'bg-chiarire'],
  ['info', 'bg-info'], ['neutro', 'bg-neutro']
];

export default function Segnaposto({ titolo, blocco }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-importi text-2xl text-secondario">{titolo}</h1>
        <p className="text-sm text-tenue">Pagina in arrivo ({blocco}).</p>
      </div>
      <section className="rounded-2xl border border-bordo bg-superficie p-4">
        <p className="text-sm text-tenue">Saldo</p>
        <p className="importo text-4xl text-testo">12.480,35 €</p>
        <div className="mt-3 flex gap-6 text-sm">
          <span className="importo text-entrata">+ 3.200,00</span>
          <span className="importo text-uscita">− 1.845,90</span>
        </div>
      </section>
      <ul className="grid grid-cols-4 gap-3 text-center text-xs text-tenue">
        {CAMPIONI.map(([nome, classe]) => (
          <li key={nome} className="space-y-1">
            <span className={`block h-10 rounded-lg ${classe}`} />
            <span>{nome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
