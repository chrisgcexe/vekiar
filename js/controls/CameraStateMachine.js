import * as THREE from 'three';

export class CameraStateMachine {
    static get CINEMATIC_STATES() { return ['INIT', 'DROP_1', 'WAIT_INPUT', 'DROP_2', 'FLY_TO', 'PLAYING']; }
    static get _TRANSITIONS() {
        return {
            'INIT':       ['DROP_1'],
            'DROP_1':     ['WAIT_INPUT', 'DROP_2', 'PLAYING'],
            'WAIT_INPUT': ['DROP_2'],
            'DROP_2':     ['PLAYING'],
            'FLY_TO':     ['PLAYING', 'FLY_TO'],
            'PLAYING':    ['FLY_TO'],
        };
    }

    constructor(controller) {
        this.controller = controller; // Referencia al orquestador principal
        this.state = 'INIT';
    }

    transitionTo(newState, { reason = 'auto' } = {}) {
        const prev = this.state;
        const states = CameraStateMachine.CINEMATIC_STATES;
        const table = CameraStateMachine._TRANSITIONS;
        
        if (!states.includes(newState)) {
            console.warn('[CameraStateMachine] estado desconocido: ' + newState + ' (' + reason + ') en ' + prev);
        }
        
        const allowed = table[prev];
        if (!(allowed && allowed.includes(newState))) {
            console.warn('[CameraStateMachine] transicion invalida ' + prev + ' -> ' + newState + ' (' + reason + ')');
        }
        
        this.state = newState;
        return prev;
    }

    update(idleDist, playableDist) {
        if (this.state === 'DROP_1') {
            if (this.controller.distance > idleDist + 0.05) {
                this.controller.distance = THREE.MathUtils.lerp(this.controller.distance, idleDist, 0.04);
                
                const startDist = 250;
                let scrollProgress = (startDist - this.controller.distance) / (startDist - idleDist);
                scrollProgress = THREE.MathUtils.clamp(scrollProgress, 0.0, 1.0);
                
                if (this.controller.mapInstance) this.controller.mapInstance.updateUnfurl(scrollProgress);

                if (scrollProgress >= 0.95) {
                    const idlePrompt = document.getElementById('idle-prompt');
                    if (idlePrompt && !idlePrompt.classList.contains('show-idle')) {
                        idlePrompt.classList.add('show-idle');
                    }
                }
            } else {
                this.controller.distance = idleDist;
                this.controller.maxDistance = idleDist; 
                this.transitionTo('WAIT_INPUT', { reason: 'intro_complete' });
                
                if (this.controller.mapInstance) this.controller.mapInstance.updateUnfurl(1.0);
                
                const idlePrompt = document.getElementById('idle-prompt');
                if (idlePrompt) idlePrompt.classList.add('show-idle');
            }

        } else if (this.state === 'DROP_2') {
            if (this.controller.distance > playableDist + 0.05) {
                this.controller.distance = THREE.MathUtils.lerp(this.controller.distance, playableDist, 0.12);
            } else {
                this.controller.distance = playableDist;
                this.controller.maxDistance = playableDist; 
                this.transitionTo('PLAYING', { reason: 'drop2' });
                
                const compassUI = document.getElementById('compass');
                if (compassUI) compassUI.classList.add('show-compass');
            }
        }
    }
}
