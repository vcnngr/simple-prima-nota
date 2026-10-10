// Cerchio con l'iniziale (controparti, studio). tono: entrata | uscita | info.
const TONI = { entrata: 'bg-entrata/15 text-entrata', uscita: 'bg-uscita/15 text-uscita', info: 'bg-info/15 text-info' };
export default function Iniziale({ nome, tono = 'info', grande = false }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold ${TONI[tono] || TONI.info} ${grande ? 'h-12 w-12 text-xl' : 'h-10 w-10'}`}>
      {(nome || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
