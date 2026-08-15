// js/ui/TooltipPositioner.js
// Responsabilidad ÚNICA: escribir el anclaje calculado en el DOM del tooltip.
// No contiene lógica geométrica: recibe un objeto {left,top,transform,
// transformOrigin,isBelow} (producido por TooltipAnchorCalculator) y lo aplica al
// elemento. Mantener la escritura del DOM aislada del cálculo evita el salto
// visual durante el fade-out (no se tocan estilos inline en onUnhover).

export class TooltipPositioner {
    /**
     * @param {HTMLElement} el     el nodo .region-tooltip
     * @param {{left:number,top:number,transform:string,transformOrigin:string,isBelow:boolean}} anchor
     */
    static apply(el, anchor) {
        if (anchor.isBelow) {
            el.classList.add('below');
        } else {
            el.classList.remove('below');
        }
        el.style.transformOrigin = anchor.transformOrigin;
        el.style.transform = anchor.transform;
        el.style.left = `${anchor.left}px`;
        el.style.top = `${anchor.top}px`;
    }
}
