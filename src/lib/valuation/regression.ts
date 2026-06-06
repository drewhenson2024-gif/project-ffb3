export type OlsModel = {
  coefficients: number[];
  featureMeans: number[];
  featureStds: number[];
  r2: number;
};

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function std(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rSquared(actual: number[], predicted: number[]): number {
  const yMean = mean(actual);
  const ssTot = actual.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = actual.reduce((s, y, i) => s + (y - predicted[i]) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col] || 1e-9;
    for (let j = col; j <= n; j++) aug[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row[n]);
}

export function fitOls(X: number[][], y: number[]): OlsModel | null {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n < k + 8) return null;

  const featureMeans = Array.from({ length: k }, (_, j) => mean(X.map((row) => row[j])));
  const featureStds = Array.from({ length: k }, (_, j) => std(X.map((row) => row[j])) || 1);

  const normalized = X.map((row) =>
    row.map((value, j) => (value - featureMeans[j]) / featureStds[j]),
  );

  const design = normalized.map((row) => [1, ...row]);
  const kFull = k + 1;
  const xtx = Array.from({ length: kFull }, () => Array(kFull).fill(0));
  const xty = Array(kFull).fill(0);

  for (let i = 0; i < n; i++) {
    for (let a = 0; a < kFull; a++) {
      xty[a] += design[i][a] * y[i];
      for (let b = 0; b < kFull; b++) {
        xtx[a][b] += design[i][a] * design[i][b];
      }
    }
  }

  const coefficients = solveLinear(xtx, xty);
  const predictions = design.map((row) =>
    row.reduce((sum, value, index) => sum + value * coefficients[index], 0),
  );

  return {
    coefficients,
    featureMeans,
    featureStds,
    r2: rSquared(y, predictions),
  };
}

export function predictOls(model: OlsModel, features: number[]): number {
  const normalized = features.map(
    (value, j) => (value - model.featureMeans[j]) / model.featureStds[j],
  );
  return [1, ...normalized].reduce(
    (sum, value, index) => sum + value * model.coefficients[index],
    0,
  );
}
