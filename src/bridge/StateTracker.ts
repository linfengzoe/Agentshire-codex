// @desc Bidirectional agentId ↔ npcId mapping and workstation allocation
export interface NPCState {
  npcId: string
  agentId: string
  phase: string
  stationId?: string
}

const WORKSTATION_IDS = ['B', 'C', 'F', 'G', 'D', 'E', 'H', 'A', 'I', 'J']

/** Maintains bidirectional agentId ↔ npcId mappings and allocates workstation slots for sub-agent NPCs */
export class StateTracker {
  private agentToNpc = new Map<string, string>()
  private npcToAgent = new Map<string, string>()
  private npcStates = new Map<string, NPCState>()
  private usedStations = new Set<string>()

  readonly stewardNpcId = 'steward'

  /** Resolve an agentId to its corresponding npcId */
  resolveNpcId(agentId: string): string | undefined {
    return this.agentToNpc.get(agentId)
  }

  resolveAgentId(npcId: string): string | undefined {
    return this.npcToAgent.get(npcId)
  }

  getStationForNpc(npcId: string): string | undefined {
    return this.npcStates.get(npcId)?.stationId
  }

  /** Register a bidirectional agentId ↔ npcId mapping */
  registerMapping(agentId: string, npcId: string): void {
    this.agentToNpc.set(agentId, npcId)
    this.npcToAgent.set(npcId, agentId)
  }

  /** Remove a mapping and associated NPC state by agentId */
  removeMapping(agentId: string): void {
    const npcId = this.agentToNpc.get(agentId)
    if (npcId) {
      const state = this.npcStates.get(npcId)
      if (state?.stationId) {
        this.usedStations.delete(state.stationId)
      }
      this.npcToAgent.delete(npcId)
      this.npcStates.delete(npcId)
    }
    this.agentToNpc.delete(agentId)
  }

  removeMappingByNpcId(npcId: string): void {
    const agentId = this.npcToAgent.get(npcId)
    if (agentId) {
      this.removeMapping(agentId)
    }
  }

  /** Allocate the next available workstation ID, honoring preferred IDs first when provided */
  allocateStation(preferredIds: string[] = []): string | null {
    const orderedIds = [...preferredIds, ...WORKSTATION_IDS]
      .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index)
    for (const id of orderedIds) {
      if (!this.usedStations.has(id)) {
        this.usedStations.add(id)
        return id
      }
    }
    return null
  }

  releaseStation(stationId: string): void {
    this.usedStations.delete(stationId)
  }

  updatePhase(npcId: string, phase: string): void {
    const state = this.npcStates.get(npcId)
    if (state) state.phase = phase
  }

  setStationForNpc(npcId: string, stationId: string): void {
    let state = this.npcStates.get(npcId)
    if (!state) {
      state = { npcId, agentId: this.npcToAgent.get(npcId) ?? '', phase: 'idle' }
      this.npcStates.set(npcId, state)
    }
    state.stationId = stationId
  }

  getAllNpcStates(): NPCState[] {
    return [...this.npcStates.values()]
  }

  /** Reset all mappings, NPC states, and station allocations */
  clear(): void {
    this.agentToNpc.clear()
    this.npcToAgent.clear()
    this.npcStates.clear()
    this.usedStations.clear()
  }
}
