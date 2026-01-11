#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Star {
    // Bitmask over colors {0,1,2,3}. Bit i set => color i is present.
    // Example: 0b0011 represents {0,1}.
    pub root_colors: u8,

    // Bitmasks of the color lists of the neighbors.
    pub neighbor_colors: Vec<u8>,

    // Number of halfedges for each neighbor.
    pub neighbor_halfedges: Vec<u8>,
}

pub static ROOT_COLOR_SUBSETS: [u8; 3] = [
    0b1111, // {0,1,2,3}
    0b0111, // {0,1,2}
    0b0011, // {0,1}
];

pub static COLOR_SUBSETS_GE2: [u8; 11] = [
    0b1111, // {0,1,2,3}
    0b0111, // {0,1,2}
    0b1011, // {0,1,3}
    0b1101, // {0,2,3}
    0b1110, // {1,2,3}
    0b0011, // {0,1}
    0b0101, // {0,2}
    0b1001, // {0,3}
    0b0110, // {1,2}
    0b1010, // {1,3}
    0b1100, // {2,3}
];

fn intersects(a: u8, b: u8) -> bool {
    (a & b) != 0
}

fn nondecreasing_sequences(t: usize, n: usize) -> Vec<Vec<usize>> {
    let mut res: Vec<Vec<usize>> = Vec::new();
    let mut current = vec![0usize; n];

    fn backtrack(
        idx: usize,
        start: usize,
        t: usize,
        current: &mut [usize],
        res: &mut Vec<Vec<usize>>,
    ) {
        if idx == current.len() {
            res.push(current.to_vec());
            return;
        }
        for v in start..=t {
            current[idx] = v;
            backtrack(idx + 1, v, t, current, res);
        }
    }

    if n == 0 {
        res.push(Vec::new());
        return res;
    }

    backtrack(0, 0, t, &mut current, &mut res);
    res
}

/// Generate all stars of a given `degree`.
///
/// A star consists of:
/// - a root with color subset in `ROOT_COLOR_SUBSETS`, and
/// - `degree` leaf neighbors, each with:
///   - a color subset in `COLOR_SUBSETS_GE2` intersecting the root's colors
///   - a halfedge count in `[2, degree]`
///
/// Neighbors are treated as an unordered multiset; enumeration uses nondecreasing index
/// sequences to avoid duplicate permutations.
pub fn generate_stars(degree: usize) -> Vec<Star> {
    let mut out: Vec<Star> = Vec::new();

    for &root_colors in ROOT_COLOR_SUBSETS.iter() {
        // Build the list of possible neighbor "types" for this root.
        // Each type is (colors, halfedges).
        let mut neighbor_types: Vec<(u8, u8)> = Vec::new();
        for &colors in COLOR_SUBSETS_GE2.iter() {
            if !intersects(root_colors, colors) {
                continue;
            }
            for h in 2..=degree {
                neighbor_types.push((colors, h as u8));
            }
        }

        for choice in nondecreasing_sequences(neighbor_types.len() - 1, degree) {
            let mut neighbor_colors: Vec<u8> = Vec::with_capacity(degree);
            let mut neighbor_halfedges: Vec<u8> = Vec::with_capacity(degree);
            for idx in choice {
                let (c, h) = neighbor_types[idx];
                neighbor_colors.push(c);
                neighbor_halfedges.push(h);
            }
            out.push(Star {
                root_colors,
                neighbor_colors,
                neighbor_halfedges,
            });
        }
    }

    out
}

pub fn hex(i: u8) -> String {
    return format!("{:x}", i);
}

pub fn star_to_string(star: &Star) -> Option<String> {
    let degree = star.neighbor_colors.len();
    debug_assert_eq!(degree, star.neighbor_halfedges.len());
    let mut s = format!("star_{degree}_");
    s.push_str(&hex(star.root_colors));

    for i in 0..degree {
        s.push_str(&hex(star.neighbor_colors[i]));
    }
    s.push('_');
    s.push('0');
    for i in 0..degree {
        s.push_str(&hex(star.neighbor_halfedges[i]));
    }
    Some(s)
}
