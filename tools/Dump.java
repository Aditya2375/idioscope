import idioscope.Engine;
import java.lang.reflect.Array;

public final class Dump {
  static String json(Object x) {
    if (x == null) return "null";
    if (x.getClass().isArray()) {
      StringBuilder s = new StringBuilder("[");
      for (int i = 0; i < Array.getLength(x); i++) {
        if (i > 0) s.append(',');
        s.append(json(Array.get(x, i)));
      }
      return s.append(']').toString();
    }
    return x.toString();
  }

  public static void main(String[] a) {
    var r =
        Engine.run(
            new Engine.Config(
                Integer.parseInt(a[0]), Integer.parseInt(a[1]), Integer.parseInt(a[2])));
    Object[] fits = new Object[6];
    for (int i = 0; i < 6; i++) {
      var f = r.fits()[i];
      fits[i] =
          new Object[] {
            f.eligible(),
            f.intercept(),
            f.phi(),
            f.innovationVariance(),
            f.mean(),
            f.equilibriumSd(),
            f.halfLife()
          };
    }
    System.out.println(
        json(
            new Object[] {
              r.means(),
              r.scales(),
              r.correlation(),
              r.eigen().values(),
              r.eigen().vectors(),
              r.projector(),
              r.residual(),
              r.levels(),
              fits,
              r.scores(),
              r.positions(),
              r.explained(),
              r.maxEigenError(),
              r.maxOrthogonality()
            }));
  }
}
