package idioscope;

import java.util.*;

public final class Engine {
  private Engine() {}

  public record Config(int factors, int training, int seed) {}

  public record Eigen(double[] values, double[][] vectors) {}

  public record Fit(
      boolean eligible,
      double intercept,
      double phi,
      double innovationVariance,
      double mean,
      double equilibriumSd,
      double halfLife) {}

  public record Result(
      Config config,
      double[][] returns,
      double[] means,
      double[] scales,
      double[][] correlation,
      Eigen eigen,
      double[][] projector,
      double[][] residual,
      double[][] levels,
      Fit[] fits,
      double[][] scores,
      int[][] positions,
      double explained,
      double maxEigenError,
      double maxOrthogonality) {}

  public static Config defaults() {
    return new Config(2, 120, 17);
  }

  public static void validate(Config c) {
    Objects.requireNonNull(c);
    if (c.factors < 1
        || c.factors > 4
        || c.training < 80
        || c.training > 160
        || c.seed < 1
        || c.seed > 9999)
      throw new IllegalArgumentException("Factors 1..4, training 80..160, seed 1..9999 required");
  }

  public static double[][] generate(int seed) {
    if (seed < 1 || seed > 9999) throw new IllegalArgumentException("Seed 1..9999");
    long s = seed;
    double[] old = new double[6];
    double[][] out = new double[200][6];
    for (int t = 0; t < 200; t++) {
      double[] u = new double[8];
      for (int j = 0; j < 8; j++) {
        s = (1664525 * s + 1013904223) & 0xffffffffL;
        u[j] = (s / 4294967296.0 - .5) * Math.sqrt(12);
      }
      for (int i = 0; i < 6; i++) {
        double state = (.65 + .04 * i) * old[i] + .004 * u[i + 2];
        out[t][i] = (.8 + .08 * i) * .006 * u[0] + (i < 3 ? 1 : -1) * .003 * u[1] + state - old[i];
        old[i] = state;
      }
    }
    return out;
  }

  public static Eigen eigen(double[][] input) {
    int n = 6;
    if (input == null || input.length != n)
      throw new IllegalArgumentException("6x6 matrix required");
    double[][] a = new double[n][n], v = new double[n][n];
    for (int i = 0; i < n; i++) {
      if (input[i] == null || input[i].length != n)
        throw new IllegalArgumentException("6x6 matrix required");
      for (int j = 0; j < n; j++) {
        if (!Double.isFinite(input[i][j]) || Math.abs(input[i][j]) > 1e6)
          throw new IllegalArgumentException("Finite matrix required");
        a[i][j] = input[i][j];
      }
      v[i][i] = 1;
    }
    for (int i = 0; i < n; i++)
      for (int j = 0; j < n; j++)
        if (Math.abs(a[i][j] - a[j][i]) > 1e-12)
          throw new IllegalArgumentException("Symmetric matrix required");
    boolean done = false;
    for (int it = 0; it < 1000; it++) {
      int p = 0, q = 1;
      double max = 0;
      for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
          if (Math.abs(a[i][j]) > max) {
            max = Math.abs(a[i][j]);
            p = i;
            q = j;
          }
      if (max < 1e-13) {
        done = true;
        break;
      }
      double theta = .5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]),
          c = Math.cos(theta),
          s = Math.sin(theta),
          app = a[p][p],
          aqq = a[q][q],
          apq = a[p][q];
      for (int i = 0; i < n; i++)
        if (i != p && i != q) {
          double x = a[i][p], y = a[i][q];
          a[i][p] = a[p][i] = c * x - s * y;
          a[i][q] = a[q][i] = s * x + c * y;
        }
      a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      a[p][q] = a[q][p] = 0;
      for (int i = 0; i < n; i++) {
        double x = v[i][p], y = v[i][q];
        v[i][p] = c * x - s * y;
        v[i][q] = s * x + c * y;
      }
    }
    if (!done) throw new IllegalArgumentException("Eigen solver did not converge");
    Integer[] order = {0, 1, 2, 3, 4, 5};
    Arrays.sort(order, (i, j) -> Double.compare(a[j][j], a[i][i]));
    double[] vals = new double[n];
    double[][] vecs = new double[n][n];
    for (int k = 0; k < n; k++) {
      int j = order[k], pivot = 0;
      for (int i = 1; i < n; i++) if (Math.abs(v[i][j]) > Math.abs(v[pivot][j])) pivot = i;
      double sign = v[pivot][j] < 0 ? -1 : 1;
      vals[k] = a[j][j];
      for (int i = 0; i < n; i++) vecs[i][k] = sign * v[i][j];
    }
    return new Eigen(vals, vecs);
  }

  public static Fit fit(double[] x, int train) {
    if (x == null || train < 2 || train > 200 || x.length < train + 1)
      throw new IllegalArgumentException("Finite levels and valid count required");
    for (double value : x)
      if (!Double.isFinite(value) || Math.abs(value) > 1e100)
        throw new IllegalArgumentException("Finite levels required");
    double mx = 0, my = 0;
    for (int t = 0; t < train; t++) {
      mx += x[t] / train;
      my += x[t + 1] / train;
    }
    double xx = 0, xy = 0;
    for (int t = 0; t < train; t++) {
      xx += (x[t] - mx) * (x[t] - mx);
      xy += (x[t] - mx) * (x[t + 1] - my);
    }
    if (xx <= 1e-20) return new Fit(false, 0, 0, 0, 0, 0, 0);
    double b = xy / xx, a = my - b * mx, sse = 0;
    for (int t = 0; t < train; t++) {
      double e = x[t + 1] - a - b * x[t];
      sse += e * e;
    }
    double variance = sse / train;
    if (!(b > 0 && b < 1 && variance > 1e-20)) return new Fit(false, a, b, variance, 0, 0, 0);
    return new Fit(
        true,
        a,
        b,
        variance,
        a / (1 - b),
        Math.sqrt(variance / (1 - b * b)),
        Math.log(2) / -Math.log(b));
  }

  public static int next(int previous, double score) {
    if (previous < -1 || previous > 1 || !Double.isFinite(score))
      throw new IllegalArgumentException("Valid state and finite score required");
    if (previous == 0) return score <= -1.25 ? 1 : score >= 1.25 ? -1 : 0;
    if (previous == 1) return score >= -.5 ? 0 : 1;
    return score <= .5 ? 0 : -1;
  }

  public static Result run(Config c) {
    validate(c);
    return analyze(c, generate(c.seed));
  }

  public static Result analyze(Config c, double[][] input) {
    validate(c);
    if (input == null || input.length != 200)
      throw new IllegalArgumentException("200 rows required");
    int n = 6, T = c.training;
    double[][] returns = new double[200][n];
    for (int t = 0; t < 200; t++) {
      if (input[t] == null || input[t].length != n)
        throw new IllegalArgumentException("6 assets required");
      for (int i = 0; i < n; i++) {
        double r = input[t][i];
        if (!Double.isFinite(r) || Math.abs(r) > 1)
          throw new IllegalArgumentException("Finite bounded returns required");
        returns[t][i] = r;
      }
    }
    double[] means = new double[n], scales = new double[n];
    for (int i = 0; i < n; i++) {
      for (int t = 0; t < T; t++) means[i] += returns[t][i] / T;
      double ss = 0;
      for (int t = 0; t < T; t++) ss += Math.pow(returns[t][i] - means[i], 2);
      scales[i] = Math.sqrt(ss / (T - 1));
      if (scales[i] <= 1e-12) throw new IllegalArgumentException("Constant or tiny training scale");
    }
    double[][] z = new double[200][n], corr = new double[n][n];
    for (int t = 0; t < 200; t++)
      for (int i = 0; i < n; i++) z[t][i] = (returns[t][i] - means[i]) / scales[i];
    for (int i = 0; i < n; i++)
      for (int j = 0; j < n; j++)
        for (int t = 0; t < T; t++) corr[i][j] += z[t][i] * z[t][j] / (T - 1);
    Eigen eig = eigen(corr);
    double[][] P = new double[n][n];
    double explained = 0;
    for (int k = 0; k < c.factors; k++) {
      explained += eig.values[k] / 6;
      for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++) P[i][j] += eig.vectors[i][k] * eig.vectors[j][k];
    }
    double[][] residual = new double[200][n],
        levels = new double[201][n],
        scores = new double[201][n];
    int[][] positions = new int[200][n];
    Fit[] fits = new Fit[n];
    for (int t = 0; t < 200; t++)
      for (int i = 0; i < n; i++) {
        double projected = 0;
        for (int j = 0; j < n; j++) projected += P[i][j] * z[t][j];
        residual[t][i] = scales[i] * (z[t][i] - projected);
        levels[t + 1][i] = levels[t][i] + residual[t][i];
      }
    for (int i = 0; i < n; i++) {
      double[] x = new double[201];
      for (int t = 0; t <= 200; t++) x[t] = levels[t][i];
      fits[i] = fit(x, T);
      if (fits[i].eligible) {
        for (int t = 0; t <= 200; t++)
          scores[t][i] = (levels[t][i] - fits[i].mean) / fits[i].equilibriumSd;
        int pos = 0;
        for (int t = T; t < 200; t++) {
          if (t > T) pos = next(pos, scores[t][i]);
          positions[t][i] = pos;
        }
      }
    }
    double ee = 0, oo = 0;
    for (int k = 0; k < n; k++)
      for (int i = 0; i < n; i++) {
        double cv = 0, dot = 0;
        for (int j = 0; j < n; j++) {
          cv += corr[i][j] * eig.vectors[j][k];
          dot += eig.vectors[j][i] * eig.vectors[j][k];
        }
        ee = Math.max(ee, Math.abs(cv - eig.values[k] * eig.vectors[i][k]));
        oo = Math.max(oo, Math.abs(dot - (i == k ? 1 : 0)));
      }
    return new Result(
        c, returns, means, scales, corr, eig, P, residual, levels, fits, scores, positions,
        explained, ee, oo);
  }
}
