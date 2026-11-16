package idioscope;

import java.util.*;

public final class TestRunner {
  static long checks = 0;

  static void ok(boolean b) {
    checks++;
    if (!b) throw new AssertionError("check" + checks);
  }

  static void near(double a, double b, double tol) {
    ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)));
  }

  static void bad(Runnable r) {
    try {
      r.run();
      throw new AssertionError("invalid accepted");
    } catch (IllegalArgumentException expected) {
      checks++;
    }
  }

  public static void main(String[] args) {
    near(Engine.next(0, -1.25), 1, 0);
    near(Engine.next(0, 1.25), -1, 0);
    near(Engine.next(1, -.5), 0, 0);
    near(Engine.next(-1, .5), 0, 0);
    near(Engine.next(1, 9), 0, 0);
    near(Engine.next(-1, -9), 0, 0);
    for (int seed : new int[] {1, 17, 9999})
      for (int T : new int[] {80, 120, 160})
        for (int k = 1; k <= 4; k++) {
          var c = new Engine.Config(k, T, seed);
          var r = Engine.run(c);
          double trace = 0;
          for (int i = 0; i < 6; i++) {
            near(r.correlation()[i][i], 1, 2e-14);
            trace += r.eigen().values()[i];
            ok(r.eigen().values()[i] >= -1e-12);
            if (i > 0) ok(r.eigen().values()[i] <= r.eigen().values()[i - 1]);
          }
          near(trace, 6, 1e-12);
          ok(r.maxEigenError() < 1e-11);
          ok(r.maxOrthogonality() < 1e-12);
          ok(r.explained() > 0 && r.explained() <= 1);
          for (int i = 0; i < 6; i++) {
            near(r.levels()[T][i], 0, 1e-13);
            for (int t = 0; t < 200; t++) {
              double reconstructed = 0;
              for (int j = 0; j < 6; j++) {
                double w = (i == j ? 1 : 0) - r.scales()[i] * r.projector()[i][j] / r.scales()[j];
                reconstructed += w * (r.returns()[t][j] - r.means()[j]);
              }
              near(reconstructed, r.residual()[t][i], 2e-14);
              near(r.levels()[t + 1][i] - r.levels()[t][i], r.residual()[t][i], 1e-14);
              ok(Double.isFinite(r.scores()[t][i]));
            }
            ok(r.positions()[T][i] == 0);
            for (int t = T + 1; t < 200; t++) {
              int expected =
                  r.fits()[i].eligible()
                      ? Engine.next(r.positions()[t - 1][i], r.scores()[t][i])
                      : 0;
              ok(r.positions()[t][i] == expected);
            }
          }
          for (int i = 0; i < 6; i++)
            for (int j = 0; j < 6; j++) {
              double pp = 0;
              for (int q = 0; q < 6; q++) pp += r.projector()[i][q] * r.projector()[q][j];
              near(pp, r.projector()[i][j], 2e-12);
              near(r.projector()[i][j], r.projector()[j][i], 1e-14);
            }
          for (int i = 0; i < 6; i++)
            for (int q = 0; q < k; q++) {
              double exposure = 0;
              for (int j = 0; j < 6; j++) {
                double w = (i == j ? 1 : 0) - r.scales()[i] * r.projector()[i][j] / r.scales()[j];
                exposure += w * r.scales()[j] * r.eigen().vectors()[j][q];
              }
              near(exposure, 0, 1e-13);
            }
          double[][] altered = Engine.generate(seed);
          for (int t = T; t < 200; t++) for (int i = 0; i < 6; i++) altered[t][i] += .01 * (i + 1);
          var future = Engine.analyze(c, altered);
          for (int i = 0; i < 6; i++) {
            near(future.means()[i], r.means()[i], 0);
            near(future.scales()[i], r.scales()[i], 0);
            ok(future.fits()[i].equals(r.fits()[i]));
            for (int j = 0; j < 6; j++) near(future.projector()[i][j], r.projector()[i][j], 0);
          }
          for (int t = 0; t < T; t++)
            for (int i = 0; i < 6; i++) near(future.residual()[t][i], r.residual()[t][i], 0);
        }
    var analytic = Engine.fit(new double[] {0, 1, 2, 1, 2, 3}, 5);
    ok(analytic.eligible());
    near(analytic.intercept(), 9.0 / 7, 1e-14);
    near(analytic.phi(), 3.0 / 7, 1e-14);
    near(analytic.innovationVariance(), 16.0 / 35, 1e-14);
    near(analytic.mean(), 9.0 / 4, 1e-14);
    near(analytic.equilibriumSd(), Math.sqrt(14.0 / 25), 1e-14);
    double[][] rankone = new double[200][6];
    for (int t = 0; t < 200; t++)
      for (int i = 0; i < 6; i++) rankone[t][i] = .001 * (1 + i) * Math.sin(t);
    var rankResult = Engine.analyze(Engine.defaults(), rankone);
    for (var fitted : rankResult.fits()) ok(!fitted.eligible());
    double[] constant = new double[81];
    ok(!Engine.fit(constant, 80).eligible());
    double[] linear = new double[81];
    for (int i = 0; i < 81; i++) linear[i] = i;
    ok(!Engine.fit(linear, 80).eligible());
    double[] alternating = new double[81];
    for (int i = 0; i < 81; i++) alternating[i] = i % 2 == 0 ? -1 : 1;
    ok(!Engine.fit(alternating, 80).eligible());
    double[][] diag = new double[6][6];
    for (int i = 0; i < 6; i++) diag[i][i] = 6 - i;
    var eig = Engine.eigen(diag);
    for (int i = 0; i < 6; i++) {
      near(eig.values()[i], 6 - i, 0);
      near(eig.vectors()[i][i], 1, 0);
    }
    double[][] block = new double[6][6];
    for (int i = 0; i < 6; i++) block[i][i] = 1;
    block[0][1] = block[1][0] = .5;
    var blockEig = Engine.eigen(block);
    near(blockEig.values()[0], 1.5, 1e-14);
    near(blockEig.values()[5], .5, 1e-14);
    near(Math.abs(blockEig.vectors()[0][0]), Math.sqrt(.5), 1e-14);
    near(Math.abs(blockEig.vectors()[1][0]), Math.sqrt(.5), 1e-14);
    near(block[0][1], .5, 0);
    double[][] huge = new double[6][6];
    huge[0][0] = 1e7;
    bad(() -> Engine.eigen(huge));
    double[][] asymmetric = new double[6][6];
    asymmetric[0][1] = 1;
    bad(() -> Engine.eigen(asymmetric));
    bad(() -> Engine.fit(new double[] {0, 1, 1e101}, 2));
    bad(() -> Engine.fit(new double[] {0, 1, 2}, 1));
    bad(() -> Engine.next(2, 0));
    bad(() -> Engine.next(0, Double.NaN));
    bad(() -> Engine.run(new Engine.Config(0, 120, 17)));
    bad(() -> Engine.run(new Engine.Config(2, 79, 17)));
    bad(() -> Engine.run(new Engine.Config(2, 120, 0)));
    bad(() -> Engine.analyze(Engine.defaults(), new double[200][6]));
    bad(() -> Engine.fit(new double[2], 80));
    double[][] invalid = Engine.generate(17);
    invalid[199][0] = Double.NaN;
    bad(() -> Engine.analyze(Engine.defaults(), invalid));
    System.out.println(checks + " Java assertions passed");
  }
}
