import { ChartColumn, Landmark, List, ListChecks, MessagesSquare, Settings, Users } from 'lucide-react';

// Un solo shell: cambiano solo le voci. Il «+» (nuovo movimento) e' dell'utente.
export const VOCI = {
  user: {
    home: '/',
    nuovo: '/nuovo',
    voci: [
      { a: '/', etichetta: 'Prima nota', Icona: List, esatto: true },
      { a: '/conti', etichetta: 'Conti', Icona: Landmark },
      // Sul telefono le controparti si aprono dal Registro (icona accanto alla ricerca).
      { a: '/controparti', etichetta: 'Controparti', Icona: Users, soloLargo: true },
      { a: '/report', etichetta: 'Report', Icona: ChartColumn },
      { a: '/studio', etichetta: 'Studio', Icona: MessagesSquare }
    ],
    impostazioni: '/impostazioni'
  },
  commercialista: {
    home: '/studio/da-fare',
    nuovo: null,
    voci: [
      { a: '/studio/da-fare', etichetta: 'Da fare', Icona: ListChecks },
      { a: '/studio/clienti', etichetta: 'Clienti', Icona: Users },
      { a: '/studio/messaggi', etichetta: 'Chat', Icona: MessagesSquare },
      { a: '/studio/impostazioni', etichetta: 'Impostazioni', Icona: Settings }
    ],
    impostazioni: '/studio/impostazioni'
  }
};
