import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { registroApi } from '../api/registro';
import BottomSheet from '../componenti/BottomSheet';
import ModuloMovimento from '../componenti/ModuloMovimento';
import Estratto from './Estratto';

// Nuovo movimento dal «+» (U4). Con ?controparte=<id> (scheda della controparte,
// U5) la controparte e' gia' scelta e si parte dall'importo.
export default function NuovoMovimento() {
  const vai = useNavigate();
  const [params] = useSearchParams();
  const id = Number(params.get('controparte')) || null;
  const c = useQuery({ queryKey: ['controparte', id], queryFn: () => registroApi.controparte(id), enabled: !!id });
  const chiudi = () => vai(id ? `/controparti/${id}` : '/', { replace: true });
  const pronta = !id || c.isSuccess || c.isError;
  return (
    <>
      <Estratto />
      <BottomSheet aperto onChiudi={chiudi} titolo="Nuovo movimento">
        {pronta
          ? <ModuloMovimento controparte={c.data ? { ...c.data, tipo_movimento_preferito: c.data.tipo_movimento_preferito || c.data.tipo_movimento_default } : null} onFatto={chiudi} />
          : <p className="text-tenue" role="status">Caricamento…</p>}
      </BottomSheet>
    </>
  );
}
