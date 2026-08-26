// Re-randeaza paginile /decoratiuni-evenimente/<slug> din public/js/decoratiuni-data.js.
// Logica traieste in src/services/decorPrerender.js, ca sa poata fi apelata si
// din panou dupa ce clientul editeaza continutul unei subpagini.
import { prerenderDecor } from '../src/services/decorPrerender.js';

const { pagini } = prerenderDecor(console.log);
console.log(`\n${pagini} pagini pre-randate in public/decoratiuni-evenimente/.`);
