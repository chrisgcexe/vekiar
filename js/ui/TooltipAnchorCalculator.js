// js/ui/TooltipAnchorCalculator.js
// Responsabilidad ÚNICA: cálculo matemático del anclaje del tooltip.
// ES PURO: no toca DOM ni Three.js. Recibe las esquinas ya proyectadas a pantalla
// (px) y devuelve left/top/transform/transformOrigin/isBelow — que TooltipPositioner
// escribe en el DOM.
//
// Contrato de esquinas: `screenCorners[0..3]` deben estar en el MISMO orden que las
// esquinas MUNDO de la hitbox del texto (`rectCorners` del evento
// `marker:region-hover`). Las aristas 0-1 y 2-3 son los bordes "superior"/
// "inferior" del rectángulo girado; se detecta cuál queda arriba comparando la Y
// de sus puntos medios (así funciona aunque la cámara no sea Perfectamente cenital).

export class TooltipAnchorCalculator {
    /**
     * @param {{x:number,y:number}[]} screenCorners 4 esquinas proyectadas a pantalla (px)
     * @param {number} tooltipW ancho del tooltip (px)
     * @param {number} tooltipH alto del tooltip (px)
     * @param {number} vpW ancho de ventana (px)
     * @param {number} vpH alto de ventana (px)
     * @param {{rotateWithText?:boolean,GAP?:number}} [opts]
     * @returns {{left:number,top:number,transform:string,transformOrigin:string,isBelow:boolean}}
     */
    static calculate(screenCorners, tooltipW, tooltipH, vpW, vpH, opts = {}) {
        const rotateWithText = opts.rotateWithText !== false;
        const GAP = opts.GAP !== undefined ? opts.GAP : 20;

        // Puntos medios de las aristas 0-1 y 2-3. topOnEdge01: la 0-1 es la superior.
        const mid01 = midPoint(screenCorners[0], screenCorners[1]);
        const mid23 = midPoint(screenCorners[2], screenCorners[3]);
        const topOnEdge01 = mid01.y <= mid23.y;
        const topMid = topOnEdge01 ? mid01 : mid23;
        const botMid = topOnEdge01 ? mid23 : mid01;
        const eA = topOnEdge01 ? screenCorners[0] : screenCorners[2];
        const eB = topOnEdge01 ? screenCorners[1] : screenCorners[3];

        // Ángulo de la arista superior (grados). La arista se recorre 0->1 (o 2->3),
        // sentido OPUESTO a la lectura, de ahí la normalización a (-90°, 90°] para que
        // rotate() deje el tooltip PARALELO al texto (155° ≡ -25°): contenido legible y
        // flecha apuntando al texto.
        let angDeg = Math.atan2(eB.y - eA.y, eB.x - eA.x) * 180 / Math.PI;
        angDeg = normalizeAngle(angDeg);

        const rad = angDeg * Math.PI / 180;

        // AABB aproximado del tooltip YA rotado (para clampear dentro de pantalla).
        const ca = Math.abs(Math.cos(rad));
        const sa = Math.abs(Math.sin(rad));
        const bw = tooltipW * ca + tooltipH * sa;
        const bh = tooltipW * sa + tooltipH * ca;

        // Normal de separación (borde inferior -> superior), escalada por GAP.
        const dx = topMid.x - botMid.x;
        const dy = topMid.y - botMid.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (dx / len) * GAP;
        const ny = (dy / len) * GAP;

        const clampX = (v) => Math.min(Math.max(v, bw / 2 + 8), vpW - bw / 2 - 8);

        // Anclas: ARRIBA (flecha sobre el borde superior) y ABAJO (variante .below).
        const ax = topMid.x + nx;
        const ay = topMid.y + ny;
        const bx = botMid.x - nx;
        const by = botMid.y - ny;

        const fitsAbove = (ay - bh) >= 0;
        const fitsBelow = (by + bh) <= vpH;

        if (rotateWithText) {
            if (fitsAbove || !fitsBelow) {
                return {
                    left: clampX(ax),
                    top: ay,
                    transform: `translate(-50%, -100%) rotate(${angDeg.toFixed(2)}deg)`,
                    transformOrigin: '50% 100%',
                    isBelow: false
                };
            }
            return {
                left: clampX(bx),
                top: by,
                transform: `translate(-50%, 0%) rotate(${angDeg.toFixed(2)}deg)`,
                transformOrigin: '50% 0%',
                isBelow: true
            };
        }

        // Variante horizontal (rotateWithText=false): anclado al borde superior sin rotar.
        return {
            left: clampX(topMid.x),
            top: topMid.y - GAP,
            transform: 'translate(-50%, -100%)',
            transformOrigin: '50% 100%',
            isBelow: false
        };
    }
}

function midPoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Normaliza (-180°, 180°] -> (-90°, 90°]: 155° y -25° son la misma recta.
function normalizeAngle(deg) {
    let a = ((deg + 180) % 360 + 360) % 360 - 180;
    if (a > 90) a -= 180;
    else if (a < -90) a += 180;
    return a;
}
