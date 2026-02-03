function diffObjects(before, after) {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return null;
  }

  const changes = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.forEach((key) => {
    const beforeValue = before[key];
    const afterValue = after[key];
    const beforeStr = JSON.stringify(beforeValue ?? null);
    const afterStr = JSON.stringify(afterValue ?? null);
    if (beforeStr !== afterStr) {
      changes[key] = { before: beforeValue ?? null, after: afterValue ?? null };
    }
  });

  return Object.keys(changes).length > 0 ? changes : null;
}

module.exports = {
  diffObjects
};
