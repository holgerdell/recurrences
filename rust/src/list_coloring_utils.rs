use crate::star_utils::Star;

/// Returns whether node 1 has higher priority than node 2.
///
/// Priority order:
/// - smaller `list_size` is higher priority
/// - if `list_size` ties, larger `degree` is higher priority
pub fn has_higher_priority(
    degree1: usize,
    degree2: usize,
    list_size1: usize,
    list_size2: usize,
) -> bool {
    (list_size1 < list_size2) || (list_size1 == list_size2 && degree1 > degree2)
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct NodeFeatures {
    pub n4_ge5: f64,
    pub n4_4: f64,
    pub n4_3: f64,
    pub n3_ge5: f64,
    pub n3_4: f64,
    pub n3_3: f64,
    pub n2_ge5: f64,
    pub n2_4: f64,
    pub n2_3: f64,
}

impl NodeFeatures {
    /// Returns a compact one-line JSON object string with no whitespace.
    pub fn to_json_string(&self) -> String {
        fn fmt_num(x: f64) -> String {
            if x == 0.0 {
                // Normalizes both 0.0 and -0.0.
                "0".to_string()
            } else {
                x.to_string()
            }
        }

        format!(
            "{{\"n4_ge5\":{},\"n4_4\":{},\"n4_3\":{},\"n3_ge5\":{},\"n3_4\":{},\"n3_3\":{},\"n2_ge5\":{},\"n2_4\":{},\"n2_3\":{}}}",
            fmt_num(self.n4_ge5),
            fmt_num(self.n4_4),
            fmt_num(self.n4_3),
            fmt_num(self.n3_ge5),
            fmt_num(self.n3_4),
            fmt_num(self.n3_3),
            fmt_num(self.n2_ge5),
            fmt_num(self.n2_4),
            fmt_num(self.n2_3),
        )
    }
}

impl std::ops::Sub for NodeFeatures {
    type Output = NodeFeatures;

    fn sub(self, rhs: NodeFeatures) -> Self::Output {
        NodeFeatures {
            n4_ge5: self.n4_ge5 - rhs.n4_ge5,
            n4_4: self.n4_4 - rhs.n4_4,
            n4_3: self.n4_3 - rhs.n4_3,
            n3_ge5: self.n3_ge5 - rhs.n3_ge5,
            n3_4: self.n3_4 - rhs.n3_4,
            n3_3: self.n3_3 - rhs.n3_3,
            n2_ge5: self.n2_ge5 - rhs.n2_ge5,
            n2_4: self.n2_4 - rhs.n2_4,
            n2_3: self.n2_3 - rhs.n2_3,
        }
    }
}

impl std::ops::Mul for NodeFeatures {
    type Output = f64;

    fn mul(self, rhs: NodeFeatures) -> Self::Output {
        self.n4_ge5 * rhs.n4_ge5
            + self.n4_4 * rhs.n4_4
            + self.n4_3 * rhs.n4_3
            + self.n3_ge5 * rhs.n3_ge5
            + self.n3_4 * rhs.n3_4
            + self.n3_3 * rhs.n3_3
            + self.n2_ge5 * rhs.n2_ge5
            + self.n2_4 * rhs.n2_4
            + self.n2_3 * rhs.n2_3
    }
}

fn bump_count(counts: &mut NodeFeatures, list_size: u32, degree: usize) {
    let degree_bucket = if degree >= 5 {
        5
    } else if degree == 4 {
        4
    } else if degree == 3 {
        3
    } else {
        0
    };

    match (list_size, degree_bucket) {
        (4, 5) => counts.n4_ge5 += 1.0,
        (4, 4) => counts.n4_4 += 1.0,
        (4, 3) => counts.n4_3 += 1.0,
        (3, 5) => counts.n3_ge5 += 1.0,
        (3, 4) => counts.n3_4 += 1.0,
        (3, 3) => counts.n3_3 += 1.0,
        (2, 5) => counts.n2_ge5 += 1.0,
        (2, 4) => counts.n2_4 += 1.0,
        (2, 3) => counts.n2_3 += 1.0,
        _ => {}
    }
}

/// Computes the counts
///
/// - $n_{4,\ge 5}, n_{4,4}, n_{4,3}$
/// - $n_{3,\ge 5}, n_{3,4}, n_{3,3}$
/// - $n_{2,\ge 5}, n_{2,4}, n_{2,3}$
///
/// for the given star.
///
/// Conventions:
/// - A vertex's list size is the popcount of its color bitmask.
/// - Root degree is the number of neighbors.
/// - Neighbor degree is `halfedges + 1`.
pub fn star_list_degree_counts(star: &Star) -> NodeFeatures {
    debug_assert_eq!(star.neighbor_colors.len(), star.neighbor_halfedges.len());

    let mut counts = NodeFeatures::default();

    // Root
    let root_list_size = star.root_colors.count_ones();
    let root_degree = star.neighbor_colors.len();
    bump_count(&mut counts, root_list_size, root_degree);

    // Neighbors
    for (&colors, &halfedges) in star
        .neighbor_colors
        .iter()
        .zip(star.neighbor_halfedges.iter())
    {
        let list_size = colors.count_ones();
        let degree = (halfedges as usize) + 1;
        bump_count(&mut counts, list_size, degree);
    }

    counts
}

/// Produces all set partitions of the set represented by `colors`.
///
/// Each partition is returned as a `Vec<u8>` of non-empty bitmasks whose bitwise OR equals
/// `colors` and which are pairwise disjoint.
///
/// Notes:
/// - If `colors == 0`, this returns a single empty partition: `[[]]`.
/// - Output is deterministic: blocks inside a partition are sorted descending by bitmask,
///   and the list of partitions is sorted by (number of blocks, lexicographic).
pub fn partitions_of_colors(colors: u8) -> Vec<Vec<u8>> {
    if colors == 0 {
        return vec![Vec::new()];
    }

    // Collect element bits (descending) to get stable, human-friendly partitions.
    let mut elems: Vec<u8> = Vec::new();
    for bit_idx in (0..8u8).rev() {
        let bit = 1u8 << bit_idx;
        if (colors & bit) != 0 {
            elems.push(bit);
        }
    }

    fn backtrack(idx: usize, elems: &[u8], blocks: &mut Vec<u8>, out: &mut Vec<Vec<u8>>) {
        if idx == elems.len() {
            let mut part = blocks.clone();
            part.sort_by(|a, b| b.cmp(a));
            out.push(part);
            return;
        }

        let bit = elems[idx];

        // Add to an existing block.
        for i in 0..blocks.len() {
            blocks[i] |= bit;
            backtrack(idx + 1, elems, blocks, out);
            blocks[i] &= !bit;
        }

        // Start a new block.
        blocks.push(bit);
        backtrack(idx + 1, elems, blocks, out);
        blocks.pop();
    }

    let mut out: Vec<Vec<u8>> = Vec::new();
    backtrack(0, &elems, &mut Vec::new(), &mut out);

    out.sort_by(|a, b| a.len().cmp(&b.len()).then_with(|| a.cmp(b)));
    out
}

/// Applies a list-coloring branching rule to a star.
///
/// The `partition` represents a partition of `star.root_colors` into disjoint non-empty blocks.
/// This produces one branch per block `b`:
/// - The root list becomes `b`.
/// - If `b` is a singleton color, that color is removed from every neighbor list.
/// - Neighbors are not dropped; they are kept with their updated color lists.
pub fn apply_list_coloring_partition(star: &Star, partition: &Vec<u8>) -> Vec<Star> {
    debug_assert_eq!(star.neighbor_colors.len(), star.neighbor_halfedges.len());

    let mut out: Vec<Star> = Vec::with_capacity(partition.len());

    for &root_block in partition.iter() {
        if root_block == 0 {
            continue;
        }

        // If the caller gives a "partition" that doesn't fit the root, ignore the extra bits.
        // (In debug, try to catch it.)
        debug_assert_eq!(root_block & !star.root_colors, 0);
        let new_root = root_block & star.root_colors;
        if new_root == 0 {
            continue;
        }

        let mut new_neighbor_colors = star.neighbor_colors.clone();
        let new_neighbor_halfedges = star.neighbor_halfedges.clone();

        // Propagate singleton root assignment by removing that color from neighbors.
        if new_root.count_ones() == 1 {
            for nc in new_neighbor_colors.iter_mut() {
                *nc &= !new_root;
            }
        }

        let mut star = Star {
            root_colors: new_root,
            neighbor_colors: new_neighbor_colors,
            neighbor_halfedges: new_neighbor_halfedges,
        };
        star = reduce_duplicate_2lists(&star).unwrap_or(star);
        out.push(star);
    }
    out
}

/// If the root has exactly 2 colors and there are at least two neighbors with the exact
/// same color list as the root, merges all such neighbors into a single neighbor.
///
/// The merged neighbor keeps the same color list as the root, and its halfedges become the
/// sum of the merged neighbors' halfedges.
///
/// Returns `None` if no reduction applies or if the halfedge sum overflows `u8`.
pub fn reduce_duplicate_2lists(star: &Star) -> Option<Star> {
    if star.root_colors.count_ones() != 2 {
        return None;
    }
    if star.neighbor_colors.len() != star.neighbor_halfedges.len() {
        return None;
    }

    // Find neighbors whose list equals the root list.
    let mut matching_indices: Vec<usize> = Vec::new();
    let mut sum: u16 = 0;
    for (i, &c) in star.neighbor_colors.iter().enumerate() {
        if c == star.root_colors {
            matching_indices.push(i);
            sum += star.neighbor_halfedges[i] as u16
        }
    }

    if matching_indices.len() < 2 {
        return None;
    }

    if sum > u8::MAX as u16 {
        return None;
    }

    let merged_halfedges = sum as u8;

    // Keep the first matching neighbor, drop the rest.
    let keep_idx = matching_indices[0];
    let mut new_neighbor_colors: Vec<u8> =
        Vec::with_capacity(star.neighbor_colors.len() - matching_indices.len() + 1);
    let mut new_neighbor_halfedges: Vec<u8> =
        Vec::with_capacity(star.neighbor_halfedges.len() - matching_indices.len() + 1);

    for i in 0..star.neighbor_colors.len() {
        if i == keep_idx {
            new_neighbor_colors.push(star.neighbor_colors[i]);
            new_neighbor_halfedges.push(merged_halfedges);
            continue;
        }
        if star.neighbor_colors[i] == star.root_colors {
            continue;
        }
        new_neighbor_colors.push(star.neighbor_colors[i]);
        new_neighbor_halfedges.push(star.neighbor_halfedges[i]);
    }

    Some(Star {
        root_colors: star.root_colors,
        neighbor_colors: new_neighbor_colors,
        neighbor_halfedges: new_neighbor_halfedges,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_valid_partition(colors: u8, part: &[u8]) -> bool {
        if colors == 0 {
            return part.is_empty();
        }
        if part.iter().any(|&b| b == 0) {
            return false;
        }
        let mut union = 0u8;
        for &b in part {
            if (union & b) != 0 {
                return false;
            }
            union |= b;
        }
        union == colors
    }

    #[test]
    fn partitions_of_0b0111_contains_examples() {
        let colors = 0b0111u8;
        let parts = partitions_of_colors(colors);

        // Bell number B3 = 5
        assert_eq!(parts.len(), 5);
        for p in &parts {
            assert!(is_valid_partition(colors, p));
        }

        assert!(parts.contains(&vec![0b0100, 0b0010, 0b0001]));
        assert!(parts.contains(&vec![0b0100, 0b0011]));
        assert!(parts.contains(&vec![0b0101, 0b0010]));
        assert!(parts.contains(&vec![0b0110, 0b0001]));
        assert!(parts.contains(&vec![0b0111]));
    }

    #[test]
    fn partitions_of_0b1111_has_15_partitions() {
        let colors = 0b1111u8;
        let parts = partitions_of_colors(colors);
        // Bell number B4 = 15
        assert_eq!(parts.len(), 15);
        for p in &parts {
            assert!(is_valid_partition(colors, p));
        }
    }

    #[test]
    fn apply_list_coloring_partition_splits_into_branches() {
        let star = Star {
            root_colors: 0b0111,
            neighbor_colors: vec![0b0011, 0b0101, 0b0110],
            neighbor_halfedges: vec![2, 2, 2],
        };
        let partition = vec![0b0001, 0b0110];

        let branches = apply_list_coloring_partition(&star, &partition);
        assert_eq!(branches.len(), 2);

        // Root=1 is singleton: remove 1 from all neighbors, but keep all neighbors.
        assert!(branches.iter().any(|b| {
            b.root_colors == 0b0001
                && b.neighbor_colors == vec![0b0010, 0b0100, 0b0110]
                && b.neighbor_halfedges == vec![2, 2, 2]
        }));

        // Root=6 does not remove any color and keeps all neighbors.
        assert!(branches.iter().any(|b| {
            b.root_colors == 0b0110
                && b.neighbor_colors == vec![0b0011, 0b0101, 0b0110]
                && b.neighbor_halfedges == vec![2, 2, 2]
        }));
    }

    #[test]
    fn reduce_duplicate_2lists_merges_root_list_neighbors() {
        let star = Star {
            root_colors: 0b0011,
            neighbor_colors: vec![0b0011, 0b0101, 0b0011, 0b0110],
            neighbor_halfedges: vec![2, 3, 5, 7],
        };

        let reduced = reduce_duplicate_2lists(&star).expect("should reduce");
        assert_eq!(reduced.root_colors, 0b0011);

        // Two neighbors equal to the root list should be merged: 2 + 5 = 7.
        assert_eq!(reduced.neighbor_colors.len(), 3);
        assert_eq!(reduced.neighbor_halfedges.len(), 3);
        assert!(
            reduced
                .neighbor_colors
                .iter()
                .zip(reduced.neighbor_halfedges.iter())
                .any(|(&c, &h)| c == 0b0011 && h == 7)
        );

        // Other neighbors are preserved.
        assert!(
            reduced
                .neighbor_colors
                .iter()
                .zip(reduced.neighbor_halfedges.iter())
                .any(|(&c, &h)| c == 0b0101 && h == 3)
        );
        assert!(
            reduced
                .neighbor_colors
                .iter()
                .zip(reduced.neighbor_halfedges.iter())
                .any(|(&c, &h)| c == 0b0110 && h == 7)
        );
    }

    #[test]
    fn reduce_duplicate_2lists_returns_none_when_not_applicable() {
        // Root has 3 colors.
        let star = Star {
            root_colors: 0b0111,
            neighbor_colors: vec![0b0111, 0b0111],
            neighbor_halfedges: vec![2, 2],
        };
        assert!(reduce_duplicate_2lists(&star).is_none());

        // Root has 2 colors, but only one matching neighbor.
        let star2 = Star {
            root_colors: 0b0011,
            neighbor_colors: vec![0b0011, 0b0101],
            neighbor_halfedges: vec![2, 2],
        };
        assert!(reduce_duplicate_2lists(&star2).is_none());
    }

    #[test]
    fn star_list_degree_counts_counts_root_and_neighbors() {
        // Degree(root)=4. Root list size=4.
        // Neighbor degrees = halfedges+1: 2->3, 3->4, 4->5.
        let star = Star {
            root_colors: 0b1111,
            neighbor_colors: vec![0b1111, 0b0111, 0b0011, 0b0111],
            neighbor_halfedges: vec![4, 3, 2, 2],
        };

        let c = star_list_degree_counts(&star);
        assert_eq!(c.n4_4, 1.0); // root
        assert_eq!(c.n4_ge5, 1.0); // neighbor (deg 5)
        assert_eq!(c.n3_4, 1.0); // neighbor (deg 4)
        assert_eq!(c.n3_3, 1.0); // neighbor (deg 3)
        assert_eq!(c.n2_3, 1.0); // neighbor (deg 3)
    }

    #[test]
    fn node_features_inner_product_basic() {
        let a = NodeFeatures {
            n4_ge5: 1.0,
            n4_4: 2.0,
            n4_3: 0.0,
            n3_ge5: -1.0,
            n3_4: 0.0,
            n3_3: 3.0,
            n2_ge5: 0.0,
            n2_4: 0.0,
            n2_3: 4.0,
        };
        let b = NodeFeatures {
            n4_ge5: 5.0,
            n4_4: 1.0,
            n4_3: 7.0,
            n3_ge5: 2.0,
            n3_4: 0.0,
            n3_3: -1.0,
            n2_ge5: 0.0,
            n2_4: 0.0,
            n2_3: 2.0,
        };
        // 1*5 + 2*1 + 0*7 + (-1)*2 + 0*0 + 3*(-1) + 0 + 0 + 4*2 = 10
        assert_eq!(a * b, 10.0);
    }

    #[test]
    fn node_features_to_json_string_is_compact() {
        let f = NodeFeatures {
            n4_ge5: 3.0,
            n4_4: -2.5,
            n4_3: 0.0,
            n3_ge5: -0.0,
            n3_4: 1.25,
            n3_3: 10.0,
            n2_ge5: -10.0,
            n2_4: 4.0,
            n2_3: 7.75,
        };

        let s = f.to_json_string();
        assert_eq!(
            s,
            "{\"n4_ge5\":3,\"n4_4\":-2.5,\"n4_3\":0,\"n3_ge5\":0,\"n3_4\":1.25,\"n3_3\":10,\"n2_ge5\":-10,\"n2_4\":4,\"n2_3\":7.75}"
        );
        assert!(!s.contains(' '));
        assert!(!s.contains('\n'));
        assert!(!s.contains('\t'));
    }
}
