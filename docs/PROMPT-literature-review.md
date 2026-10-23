# Prompt: literature review of the author's techniques

Paste the block below into an agent with web search (and attach [TECHNIQUES.md](TECHNIQUES.md), [PHYSICS.md](PHYSICS.md) and [GRAPHICS.md](GRAPHICS.md), which hold the exact formulas). Run it twice in two different agents: if they agree the confidence rises, if they differ read the sources by hand. Save the result in `docs/` and link it from TECHNIQUES.md (PENDING 2q, the paper plan).

The author's own statement of purpose, to give the reviewer the right frame: his physics is for **O(1) collisions, one unified gravity, and drawing fluids and optics at a much lower cost** (a "light and good-looking" engine). Judge the techniques against that goal: not only "is the formula new" but "is the cost/accuracy trade-off new".

```text
Actuá como revisor de literatura técnica (gráficos por computadora en tiempo real, simulación física,
física de fluidos y óptica). Adjunto el registro de técnicas propias de un autor independiente
(TECHNIQUES.md, PHYSICS.md, GRAPHICS.md, con fórmulas y ubicación en el código). El propósito del
autor: física con colisiones de costo constante O(1), una gravedad unificada, y dibujar fluidos y óptica
mucho más livianos que los métodos estándar. Quiero saber, para cada técnica, si es CONOCIDA, una
RE-PARAMETRIZACIÓN de algo conocido, o POSIBLEMENTE NUEVA. Nadie revisó la literatura todavía: no
asumas novedad ni la descartes sin evidencia. Evaluá también el compromiso costo/precisión (¿es nuevo
lograr este resultado a este costo?), no solo la fórmula.

TÉCNICAS (una por una, con la fórmula del archivo adjunto):

ÓPTICA Y LUZ
1. Fresnel áureo: curva (1 - cos)^(phi^2) mezclada con un R0 salido de un salto de impedancia por
   "saturación de pared". Comparar con Schlick y con las ecuaciones de Fresnel.
2. Segunda curva de reflexión phi^(-(pi/2)/theta) con factor rasante.
2b. Impedancia R0 = ((S_agua - S_aire)/(S_agua + S_aire))^2 con números de saturación del autor
   (da un aspecto, no el valor real del agua, ~0,02). Comparar con R0 = ((n1-n2)/(n1+n2))^2.
3. Freno por saturación: luz restante con la profundidad v = 1 - (S/0,25)^phi, rojo absorbido antes que
   azul por potencias de phi. Comparar con Beer-Lambert por canal.
12. Enfoque de shader liviano: refracción analítica, caustics y niebla en una sola pasada, con la misma
   función de olas en CPU y GPU, sin render targets. Comparar con screen-space refraction, caustics
   analíticos y agua "barata" en tiempo real.

FLUIDOS (OLAS Y REMOLINOS)
4. Cresta tensa de Hooke: ola con (1 - |sin|)^p mezclada con un seno, más "seda" (segundo armónico).
   y = level + fade * sum_i amp_i * w_i, con w = (1-hooke)(s + silk*0,8*cos 2p) + hooke*((1-|s|)^pressure_i - 0,45)*2,15.
   Comparar con sumas de senos, Gerstner/trocoidal, Tessendorf (FFT), y la cresta (1-|sin|)^p ya usada
   en shaders de agua.
5. Escalado fractal áureo de 8 olas (amplitud, frecuencia, velocidad y presión por razones de phi;
   direcciones en espiral de ángulo áureo, Fibonacci, swell paralelo). Comparar con espectros (Phillips,
   JONSWAP, Pierson-Moskowitz), sumas fractales y distribuciones de Vogel.
9. Remolinos áureos ("Ley 3"): embudo -20 s/(1 + (r/R)^1,65 + 0,25), ola en espiral logarítmica áurea y
   velocidad tangencial 28 s/sqrt(r) con parte radial 2 ln(phi)/pi * 1,35. Comparar con Rankine,
   Lamb-Oseen, Burgers y espirales logarítmicas en vórtices.
6. Flotación "Arquímedes + resorte de Hooke": empuje proporcional a la profundidad hundida, resorte
   sobre el solape, arrastre viscoso y arrastre por la corriente. Comparar con flotación por penalización
   en motores de juego y con el principio de Arquímedes por volumen sumergido.

RUIDO Y DISTRIBUCIÓN
10. Hash áureo y ruido fractal áureo (octavas giradas por el ángulo áureo y escaladas por phi).
    Comparar con FBM, value noise, hashes de shader y la filotaxis de Vogel (1979).
11. Órbitas/empaquetado áureo (radio ~ sqrt(n), ángulo áureo). Comparar con el modelo de girasol de
    Vogel y las redes de Fibonacci.

COLISIONES Y GRAVEDAD
7. Colisiones O(1) de Hooke y "física unificada": contacto resorte-amortiguador sobre un hash espacial
   (celda 2,6 m, 16384 cubetas, 27 vecinas), costo constante por cuerpo, con esferas, cajas y
   ragdolls (huesos como restricciones) en un solo solver. Cada sub-paso (3 por paso de 1/60 s):
   predecir v += g h, x += v h; pares por hash; 2 pasadas de restricciones donde la separación es
   overlap / (w_a + w_b + 1/(k h^2)) con k = 100000 N/m (Hooke como complianza de la restricción),
   fricción de Coulomb sobre el desplazamiento del sub-paso, y velocidad v = (x - x_old)/h con rebote
   de restitución 1 - 0,273. Comparar con Position Based Dynamics / XPBD (Müller et al.), contacto por
   penalización, solvers de impulsos secuenciales (Box2D, Bullet), hash espacial (Teschner 2003) y
   Verlet. Pregunta clave: ¿"O(1) por cuerpo" es solo hash espacial con vecindad acotada, o hay algo más?
8. Gravedad: en el juego es una constante única (20 m/s^2). Aparte, en las demos del autor hay un
   modelo teórico "Arquímedes inverso / Mar Sub-Planckiano": la gravedad como EMPUJE de un fluido
   hacia abajo por la "sombra" de la masa del planeta más cercano (una flecha rosa sobre la nave
   muestra hacia dónde empuja el mar por la sombra del planeta; punto de Lagrange donde el empuje de
   dos planetas se equilibra; onda de choque que desplaza el fluido local; saturación 0,25 que
   evita la división por cero). Revisalo con cuidado y separalo en dos: (a) como técnica de simulación
   en un juego; (b) como afirmación física. Comprobá la relación con las teorías de gravedad por
   sombra o por empuje de corpúsculos (por ejemplo Fatio, Le Sage), su historia y las objeciones
   conocidas (arrastre, calentamiento, aberración), y decí claramente si coincide con ellas.

CÓMO BUSCAR
- Fuentes: Google Scholar, arXiv (cs.GR, physics.flu-dyn, physics.hist-ph, gr-qc), ACM DL (SIGGRAPH,
  I3D, EGSR, SCA), GPU Gems / GPU Pro / ShaderX / Real-Time Rendering, JCGT, Shadertoy, GDC, y
  patentes (Google Patents, Espacenet, USPTO).
- Por técnica probá varias formulaciones en inglés: el nombre de la fórmula, el exponente o la
  constante, "golden ratio" + el tema, "phi" + el tema, y la técnica estándar al lado. Buscá también
  variantes algebraicas equivalentes de la fórmula.

FORMATO
Una tabla: | # | Técnica | Veredicto (CONOCIDA / RE-PARAMETRIZACIÓN / POSIBLEMENTE NUEVA / NO SE PUDO
DETERMINAR) | Trabajo previo más cercano (autor, año, título, enlace) | Qué cambia exactamente |
Confianza (alta/media/baja) |. Después, por técnica: 3 a 5 referencias con enlace, una frase de por qué
se parecen y qué diferencia concreta existe (fórmula, constante, dominio, costo).

REGLAS DE HONESTIDAD
- "No lo encontré" NO significa "es nuevo": decí qué buscaste y dónde, y marcá la confianza.
- Distinguí idea nueva, constante nueva en una forma conocida y nombre nuevo.
- No inventes referencias: cada cita con un enlace que hayas abierto. Si no podés verificar, decilo.
- Separá lo que es solo un efecto visual ("se ve bien") de lo que tiene justificación física.
- Para la 7 y la 8, separá lo implementable y medible (costo, error) de lo teórico.
- Al final: qué técnicas conviene medir contra el estándar (error y costo) para sostener una
  afirmación de novedad en un paper, y el experimento mínimo para cada una.
```

## Why the prompt looks like this

| Choice                                                            | Reason                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Techniques grouped by area and keep the register's numbers (1-12) | The reviewer can map each result back to a row of TECHNIQUES.md                                                                                                                           |
| Items 7 and 8 carry their formulas                                | The register only names them; the solver's formula is in PHYSICS.md section 5 and the gravity model in the demo `game-engine/ai_studio_code (1).html` (lines 55, 146, 160, 496, 527, 819) |
| Item 8 is split in two and asks about shadow-gravity theories     | Gravity as a push from a fluid shadowed by mass looks like known historical ideas (Fatio, Le Sage); that must be answered with sources, not assumed. It is not used in the game           |
| Cost/accuracy is part of the question                             | The author's goal is a cheaper way to get the same look and behaviour, so "new at this cost" can hold even when the formula has precedents                                                |
