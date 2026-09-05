export class MarkerInteractionState {
    constructor(registry) {
        this.registry = registry;
        
        this.hoveredMeshId = null;
        this._hoveredRegionId = null;
        this._focusedRegionId = null;
        this._focusedRegionName = null;
        this._overviewHoveredId = null;
        this.cursorUV = { u: -1, v: -1 };
        
        this._lastFocusedRegionId = null;
        this._needsRedraw = false;
    }

    consumeNeedsRedraw() {
        const changed = this._lastFocusedRegionId !== this._focusedRegionId;
        this._lastFocusedRegionId = this._focusedRegionId;
        if (changed) this._needsRedraw = true;
        
        const res = this._needsRedraw;
        this._needsRedraw = false;
        return res;
    }

    getFocusedRegionName() {
        return this._focusedRegionName;
    }

    getFocusedRegionId() {
        return this._focusedRegionId;
    }
    
    getHoveredRegionId() {
        return this._hoveredRegionId;
    }

    setHoveredRegion(regionId) {
        if (this._hoveredRegionId !== regionId) {
            this._hoveredRegionId = regionId;
            return true;
        }
        return false;
    }

    setFocusedRegion(regionId) {
        if (this._focusedRegionId !== regionId) {
            this._focusedRegionId = regionId;
            if (regionId) {
                const r = this.registry.getById(regionId);
                this._focusedRegionName = r ? r.data.name : null;
            } else {
                this._focusedRegionName = null;
            }
            return true;
        }
        return false;
    }

    setOverviewHover(regionId) {
        if (this._overviewHoveredId !== regionId) {
            this._overviewHoveredId = regionId;
            return true;
        }
        return false;
    }

    clearHovers() {
        let changed = false;
        if (this.hoveredMeshId !== null) {
            this.hoveredMeshId = null;
            changed = true;
        }
        if (this._overviewHoveredId !== null) {
            this._overviewHoveredId = null;
            changed = true;
        }
        if (this._hoveredRegionId !== null) {
            this._hoveredRegionId = null;
            changed = true;
        }
        return changed;
    }
}
