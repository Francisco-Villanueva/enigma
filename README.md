# Misión: Enigma Core

Escape room digital remoto para 6 personas. Cada jugador ve solo el panel de su rol y el equipo gana comunicándose por la videollamada.

Estado: **etapa 5** (motor de juego + los desafíos + briefing y rotación de roles). Hay lobby con código de sala, reconexión, timer del servidor, fases (jugando, pausa, transición, victoria, derrota), vista por rol y controles del facilitador. Los desafíos cargados son el **Desafío 1 (Núcleo de Energía)** el **Desafío 2 (Navegación y Rutas Bloqueadas)** y el **Desafío 3 (Circuito Maestro)**; el desafío de práctica (`server/src/challenges/sandbox.ts`) queda solo para los tests del motor.

## Desafío 1: Núcleo de Energía

10 reactores: 4 críticos (se dejan en 0%) y 6 sanos. Los datos cambian en cada partida (semilla). Potencia de cada sano = `10% + 10% × conexiones con reactores sanos + bono por temperatura` (menos de 350°C: +0%; 350-599°C: +10%; 600°C o más: +20%).

- **Navegador**: ve el mapa completo (12 a 14 conexiones), sin saber cuáles reactores están fallados.
- **Analista**: ve temperatura y presión de cada reactor y la regla «es crítico si la temperatura supera a la presión por más de 40»: tiene que hacer la cuenta. De él salen los críticos (cuyas conexiones no cuentan) y la temperatura de cada sano.
- **Criptógrafo**: tiene la fórmula y la tabla de bonos por temperatura, y recibe las lecturas (temperatura y presión) que el Analista le **envía** reactor por reactor (`core:share`); no sabe la regla de diagnóstico.
- **Estratega**: ve la secuencia de calibración de los 10 reactores, con los fallados intercalados, y tacha los que no funcionan (se lo dice el Analista). Lo que queda es el orden final.
- **Ingeniero**: mueve los sliders (saltos de 10%) y fija cada reactor; los críticos deben quedar en 0%.
- **Hacker**: **confirma cada reactor**: cuando el Ingeniero fija uno bien (orden y potencia), queda pendiente y solo se calibra cuando el Hacker escribe el código de enlace de 4 dígitos que el Ingeniero le dicta (`core:confirm`; código equivocado −10 s; mientras hay uno pendiente no se puede fijar otro). Al final, con los 6 alineados ve el código de confirmación e inyecta la carga final.

El generador garantiza que varios sanos estén conectados a críticos: contar las conexiones del mapa sin pasar por el Analista da una potencia equivocada.

Penalidades (valores por defecto, no están en el PRD): sobrecargar un crítico −30 s, calibrar fuera de orden −30 s, potencia equivocada −15 s. Se ajustan en `shared/src/index.ts`.

## Desafío 2: Navegación y Rutas Bloqueadas (mapa en capas)

Grilla 6×6 de A1 a F6, dos checkpoints en orden y 7 minas. Ningún rol ve el mapa completo: cada uno tiene una capa distinta y hay que cruzarlas hablando.

- **Navegador**: mueve la nave con las flechas. Ve su posición, el **radar** (minas en las 8 casillas vecinas) y el radar de cada casilla ya pisada. No ve minas ni terreno.
- **Analista**: totales de minas por fila, columna y cuadrante (no coordenadas). Anota sospechas y, cuando está seguro, **marca una mina para que el Navegador la vea en su mapa**.
- **Criptógrafo**: pistas verdaderas sobre las minas (para ayudar al Analista a deducir) y los protocolos de movimiento. Los controles son siempre normales: no hay reglas por sector.
- **Estratega**: mapa de **terreno** con la posición de la nave en vivo (libre 1, asteroides 2, pozo 3 = carga necesaria para entrar), checkpoints, inicio y meta. Debe elegir la ruta de menor gasto de batería.
- **Ingeniero**: batería limitada (`ceil(mínimo × 1.4) + 2`); carga cada propulsor de 1 a 3 (sale de la batería). El movimiento consume toda la carga del propulsor. Recarga de emergencia: +10, cuesta 30 s.
- **Hacker**: desencripta el escudo de cada checkpoint (minijuego de secuencia) y hace **consultas al radar** (5 gratis, luego 10 s cada una).

Penalidades: mina −60 s y vuelve al último punto seguro; gravedad (3.ª vez seguida en la misma dirección) −15 s; secuencia de escudo errada −10 s. El generador reintenta hasta que el tablero tenga solución (Dijkstra sobre posición/dirección/racha/checkpoints) y el facilitador ve la ruta óptima en "Ver solución".

## Desafío 4: Intercepción de Señales

Una transmisión llega en 4 ráfagas (Alfa, Beta, Gamma, Delta), cada una con una palabra cifrada. Las palabras forman la clave de reinicio y hay que transmitirlas en un orden concreto.

- **Navegador**: rumbo en grados desde el que llega cada ráfaga.
- **Criptógrafo**: tabla rumbo → canal (9 canales de 40°) y el método de cifrado de cada ráfaga (desplazamiento adelante/atrás, espejo, inverso) con sus pasos.
- **Ingeniero**: único que sintoniza; con el canal equivocado pierde 5 s. Sin sintonizar, el Hacker no recibe el texto.
- **Analista**: desfase (1–25) de cada ráfaga, medido en el espectro.
- **Estratega**: orden de lectura de las palabras.
- **Hacker**: recibe el cifrado, lo descifra con método + desfase (primera prueba gratis por ráfaga, luego 5 s) y transmite las 4 palabras. Un intento errado cuesta 20 s y informa cuántas están en su lugar.

## Desafío 5: La Bomba

Tiempo real, 5:00 por intento. Hay que cortar 4 de los 6 cables en el orden correcto. Un corte equivocado suma un error; con 3 errores o al agotarse el reloj, la bomba se reinicia en silencio (mismo cableado). Todos los roles ven el reloj y los errores.

- **Navegador**: qué color tiene el cable de cada posición (1 a 6).
- **Analista**: qué dos colores son trampa (no se cortan).
- **Estratega**: la prioridad de los colores: los cables reales se cortan en ese orden.
- **Criptógrafo**: el PIN del panel, en símbolos.
- **Hacker**: la tabla símbolo → dígito; teclea el PIN para desbloquear el panel (PIN errado: −5 s).
- **Ingeniero**: corta cables por posición, pero solo con el panel desbloqueado.

## Desafío 6: El Puente de Cristal

Sin reloj. Seis filas, cada una con un acertijo de dos respuestas posibles; cada respuesta es una baldosa (una firme y una de cristal falso). Todo el equipo ve el acertijo y lo resuelve hablando; solo el Estratega pisa. Cada rol es especialista de una categoría (Analista: números, Criptógrafo: palabras, Hacker: lógica, Navegador: espacio, Ingeniero: mecánica, Estratega: razonamiento) y solo él ve la pista de ese acertijo, cuando le toca. Al resolver cada fila se muestra la explicación. Una baldosa equivocada se rompe y suma un error; con 2 errores el puente se reinicia en silencio con acertijos nuevos. El banco (`server/src/challenges/bridge-riddles.ts`) tiene 5 acertijos por categoría; para sumar más, se agregan ahí.

## Transmisión de pantalla (simulada)

Cualquier jugador puede proponer que todos vean la pantalla de un compañero (o la propia). No es video: el servidor ya arma la vista de cada rol, así que a los espectadores se les reenvía esa misma vista y se dibuja con el panel de siempre, deshabilitado y de solo lectura.

- **Quién decide:** votación de 15 s. Quien propone cuenta como «sí»; se aprueba con 4 «sí» de 6 y se rechaza con el tercer «no» o al vencer el tiempo. Una votación rechazada o vencida no cuesta nada, pero obliga a esperar 20 s para volver a proponer.
- **Costo:** 3 créditos de señal por misión (no se ganan). Con 0 créditos, cada transmisión cuesta 20 s del reloj; no se puede pagar con tiempo si eso terminaría la partida (`share_no_budget`). El cobro se hace recién cuando la votación se aprueba.
- **Duración y límites:** sin límite de tiempo: como ya se pagó, dura hasta que termina el desafío (se completa, se pierde o se salta) o hasta que el facilitador la corta. Vale en cualquier desafío, y hay una sola votación o transmisión a la vez: mientras alguien está en vivo no se puede abrir otra votación.
- **Pausa:** la votación y la espera se congelan junto con el reloj; la transmisión sigue activa.
- **Cortes:** si se desconecta quien transmite, la señal se corta (sin devolver el crédito). Al completar el desafío o al perder se cierra todo; los créditos se conservan entre desafíos y «Volver a jugar» devuelve los 3.
- **Facilitador:** puede cancelar la votación o la transmisión en curso (`share:cancel`, no devuelve el cobro) y sumar o restar créditos (`share:credits`).
- **Qué se espeja:** (1) todo lo que el servidor ya le manda a ese rol y (2) lo que el emisor hace en su pantalla y no vive en el servidor: notas de minas/seguras y celda seleccionada del Analista, la secuencia del Hacker, piezas seleccionadas o arrastradas en el circuito, casilleros marcados y valores del Núcleo, canales/métodos/palabras de la señal, PIN de la bomba, código del sandbox. Eso lo publica el navegador del emisor con el evento `share:ui` (con límite de tamaño); el servidor solo lo valida y lo reenvía. Para que un estado nuevo se espeje, se declara con `useSharedState('clave.unica', inicial)` en lugar de `useState` (`client/src/lib/shareUi.tsx`).
- **Qué no se espeja:** el cursor, el hover, el scroll, los mensajes de error momentáneos ni los cronómetros locales (estos se calculan con datos del servidor).
- **Dónde está:** constantes `SHARE_*` y tipos en `shared/src/index.ts`; reglas en `server/src/share.ts` y `server/src/rooms.ts` (`proposeShare`, `voteShare`); eventos `share:propose`, `share:vote` y `share:ui`; el estado viaja en `RoomState.share`; la UI en `ShareBar`, `PlayStage` y `BroadcastFrame`. Tests: `server/src/share.test.ts`.

## Menos de 6 jugadores y retomar una partida

- **Se puede empezar con cualquier cantidad de jugadores** (mínimo 1). Con menos de 6, cada persona puede tener **varios roles**: en el briefing toca un rol para tomarlo y tócalo de nuevo para soltarlo, o el facilitador reparte «los roles que nadie tiene» (se reparten parejo). El desafío no empieza hasta que los 6 roles tienen dueño y todos tienen al menos uno.
- **Jugar con varios roles:** arriba del panel aparece «Playing as» con una pestaña por rol; el cambio es instantáneo y sin penalidad. El servidor trata a la persona como el rol activo, así que las reglas de cada desafío no cambian (solo se vuelve más fácil, porque una persona hace de varios).
- **Sin repetir roles solo con 6 jugadores:** con menos, esa regla se desactiva (no se podría cumplir). El calentamiento y el paso final reparten los 6 roles entre los presentes.
- **Transmisión de pantalla:** los «sí» necesarios son 4 con 6 jugadores y mayoría simple con menos.
- **Retomar una partida:** en la sala de espera, «Resume a mission» salta directo al briefing del desafío elegido (comando `jump`), dando por completados los anteriores (sus fragmentos ya figuran en el expediente) y con los minutos que indiques. Los roles ya jugados no se recuerdan: arrancan de cero.

## Flujo y rotación de roles

`lobby → briefing → playing ⇄ paused → transition → briefing (siguiente) … → won | lost`

- Antes de cada desafío hay una pantalla de **briefing**: historia, objetivo y qué hace cada rol. Ahí cada jugador elige su rol (o lo suelta y elige otro).
- **No se puede repetir un rol ya jugado.** Se registra cuando el facilitador pulsa «Comenzar» (un desafío saltado también cuenta). Así, con 6 desafíos todos pasan por los 6 roles.
- El servidor valida cada elección con un emparejamiento (`server/src/roles.ts`): rechaza (`role_unavailable`) una elección que dejaría a alguien sin rol posible. Errores: `role_used`, `role_taken`.
- El facilitador tiene «Asignar al azar» (`autoassign`) y «Comenzar» (`begin`, requiere los 6 roles asignados). El tiempo del briefing no consume el reloj de 3000 s.
- Hay un máximo de 6 desafíos (el constructor de `RoomManager` falla si hay más).
- Helpers de tests: `server/src/test-utils.ts`.

## Estructura

```text
shared/                      tipos, roles y eventos usados por servidor y cliente
server/src/rooms.ts          motor: salas, fases, timer y comandos del facilitador
server/src/challenges/       un archivo por desafío (misma interfaz: types.ts)
server/src/game-server.ts    Socket.io: conecta los eventos con el motor
client/                      React + Vite + Tailwind
```

El servidor es la autoridad: los clientes mandan intenciones y reciben solo la vista de su rol.

## Cómo se agrega un desafío

1. Crear `server/src/challenges/<nombre>.ts` que implemente `ChallengeModule` (estado inicial con semilla, vista por rol, reglas, condición de victoria).
2. Sumar sus tipos de vista y de acción a las uniones `ChallengeView`, `FacilitatorView` y `ChallengeAction` en `shared/src/index.ts`.
3. Registrarlo en `server/src/challenges/index.ts` (el orden de la lista es el orden de juego; los ids van de 1 a N).
3b. Definir su `briefing` (historia, objetivo y tarea de cada rol).
4. Crear su panel en `client/src/components/` y mostrarlo desde `GameScreen.tsx`.

## Controles del facilitador

Pausar y reanudar, sumar o restar 1 minuto, mandar una pista a todos, sumar o restar créditos de señal y cortar una votación o transmisión de pantalla, reiniciar el desafío (mismos datos), saltarlo y liberar el siguiente desde la pantalla de transición y, al terminar la misión (ganada o perdida), **«Volver a jugar»** (`replay`): vuelve al briefing del desafío 1 con los mismos 6 jugadores, el reloj entero, datos nuevos y todos los roles libres. También puede ver la solución, escondida como spoiler.

## Comandos

```bash
npm install
npm run dev:server    # servidor en :3001
npm run dev:client    # frontend en :5173 (redirige los sockets al servidor)
npm test              # tests del servidor
npm run typecheck     # tipos de los tres paquetes
npm run build && npm start   # un solo proceso sirve todo en :3001
```

Para probar con varias personas en tu computadora, abrí varias ventanas de incógnito en `http://localhost:5173`.

## Decisiones tomadas

- El facilitador es quien crea la sala y es uno de los 6 jugadores (conserva su rol).
- Al pisar una mina el dron vuelve al último checkpoint y se restan 60 s.
- Dos propulsores (lineal y lateral); cada carga permite 1 movimiento.
- Los datos de cada desafío cambian por partida, generados con una semilla.
- Código de sala de 4 caracteres sin letras ni números confusos (sin 0, O, 1, I).

## Despliegue

Necesita un servidor siempre activo (los planes gratuitos que se duermen cortan los WebSockets). Variables: `PORT` (por defecto 3001) y `CORS_ORIGIN` solo si el frontend se sirve desde otro dominio.

## Desafío 3: Reensamblaje del Circuito Maestro

Tablero de 4×4 con 6 piezas (Fusible, Interruptor, Nodo T, Nodo Y, Cable recto, Cable codo); cada una tiene casilla y rotación (Norte/Este/Sur/Oeste). Todo sale de la semilla.

Nadie tiene la solución completa: hay que cruzar datos (casilla + qué pieza + rotación).

- **Analista**: escáner (una vez, 8 s): ve **dónde** hay piezas, 6 casillas sin nombre. Después el servidor deja de enviarlo (no se oculta en el cliente).
- **Criptógrafo**: pistas de **identidad** (esquina/borde/centro, misma fila o columna, más arriba o a la izquierda, contiguas o no) que dicen qué pieza va en cada casilla.
- **Navegador**: **brújula** con la rotación correcta de cada pieza; además marca la casilla en foco y ve qué casillas están ocupadas.
- **Estratega**: orden de montaje por fases (Fusibles, Nodos, Cables, sorteado) y qué piezas van en la mitad superior (filas 1-2) o inferior (filas 3-4).
- **Ingeniero**: no sabe nada de la solución; arrastra (o toca y toca), rota y quita piezas.
- **Hacker**: "Verificar voltaje" con detalle **pieza por pieza** (con 6/6 se completa) y re-escáner de 4 s para el Analista.

Al generar el circuito se garantiza que las 6 casillas del Analista + las pistas del Criptógrafo + las mitades del Estratega dejan **una sola** asignación posible pieza → casilla (`countIdentityAssignments` en `circuit.ts`, cubierto por tests con 200 semillas).

Penalidades por defecto: pieza fuera de fase −15 s; re-escáner −20 s (máximo 2); verificar voltaje gratis las primeras 3 veces y después −10 s cada una.

Los tiempos del escaneo usan el **reloj de juego** (se detiene en las pausas). Para eso el contrato de los desafíos recibe `clockMs` y puede declarar `viewChangeAt`, y el servidor avisa a todos cuando una vista cambia sola con el tiempo.
