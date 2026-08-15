// core/experiment-registry.js
// 只读研究基础设施：实验注册层。定义实验元数据，不接生产、不改任何产品行为。

export class ExperimentRegistry {
  constructor() {
    this._map = new Map();
  }

  /**
   * 注册一个实验。
   * @param {Object} def - { experimentId, name, hypothesis, variants:[{id,label}], metrics:[string], subjectUnit, seed }
   */
  register(def) {
    if (!def || !def.experimentId) throw new Error('experimentId required');
    if (!Array.isArray(def.variants) || def.variants.length < 2) throw new Error('at least 2 variants required');
    const exp = {
      experimentId: def.experimentId,
      name: def.name || def.experimentId,
      hypothesis: def.hypothesis || '',
      variants: def.variants.map((v, i) => ({ id: v.id, label: v.label || v.id, index: i })),
      metrics: Array.isArray(def.metrics) ? def.metrics.slice() : [],
      subjectUnit: def.subjectUnit || 'session',
      seed: def.seed !== undefined ? def.seed : 0,
      registeredAt: def.registeredAt || Date.now(),
    };
    this._map.set(exp.experimentId, exp);
    return exp;
  }

  get(experimentId) { return this._map.get(experimentId) || null; }

  list() { return Array.from(this._map.values()); }

  toExperimentJson(experimentId) {
    const exp = this.get(experimentId);
    return exp ? JSON.parse(JSON.stringify(exp)) : null;
  }
}