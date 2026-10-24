import { ChartColumn, List, ListChecks, MessagesSquare, ScrollText, Settings, Users } from 'lucide-react';

// Un solo shell: cambiano solo le voci. Il «+» (nuovo movimento) e' dell'utente.
export const VOCI = {
  user: {
    home: '/',
    nuovo: '/nuovo',
    voci: [
      { a: '/', etichetta: 'Estratto', Icona: ScrollText, esatto: true },
      { a: '/movimenti', etichetta: 'Movimenti', Icona: List },
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
