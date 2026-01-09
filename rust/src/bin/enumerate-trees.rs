use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Node {
    // Bitmask over colors {0,1,2,3}. Bit i set => color i is present.
    // Example: 0b0011 represents {0,1}.
    pub colors: u8,
    /// Number of dangling halfedges at this node.
    ///
    /// Invariant:
    /// - If `children` is non-empty, then `halfedges == 0`.
    /// - If `children` is empty (leaf), then `halfedges >= 2` (and enumeration
    ///   additionally enforces `halfedges <= degree`).
    pub halfedges: u8,
    pub children: Vec<Node>,
}

impl Node {
    pub fn new_internal(colors: u8, children: Vec<Node>) -> Self {
        debug_assert!(colors != 0, "colors must be non-empty");
        debug_assert!(colors & !0b1111 == 0, "colors must be in 0..=3");
        debug_assert!(colors.count_ones() >= 2, "colors must have size >= 2");
        debug_assert!(!children.is_empty(), "internal node must have children");
        Self {
            colors,
            halfedges: 0,
            children,
        }
    }

    pub fn new_leaf(colors: u8, halfedges: u8) -> Self {
        debug_assert!(colors != 0, "colors must be non-empty");
        debug_assert!(colors & !0b1111 == 0, "colors must be in 0..=3");
        debug_assert!(colors.count_ones() >= 2, "colors must have size >= 2");
        debug_assert!(halfedges >= 2, "leaf must have at least 2 halfedges");
        Self {
            colors,
            halfedges,
            children: Vec::new(),
        }
    }
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

fn generate_subtrees_with_parent(
    depth: usize,
    degree: usize,
    parent_color_idx: usize,
    cache: &mut HashMap<(usize, usize, usize), Vec<Node>>,
) -> Vec<Node> {
    let key = (depth, degree, parent_color_idx);
    if let Some(cached) = cache.get(&key) {
        return cached.clone();
    }

    let children_count = if depth == 0 {
        0
    } else {
        // For non-root nodes, degree includes the edge to the parent.
        degree.saturating_sub(1)
    };

    // Can't realize positive depth without children.
    if depth > 0 && children_count == 0 {
        cache.insert(key, Vec::new());
        return Vec::new();
    }

    let parent_colors = COLOR_SUBSETS_GE2[parent_color_idx];
    let mut out: Vec<Node> = Vec::new();

    for (idx, colors) in COLOR_SUBSETS_GE2.iter().enumerate() {
        if !intersects(parent_colors, *colors) {
            continue;
        }

        if depth == 0 {
            // Leaf: vary halfedges from 2..=degree.
            // If degree < 2, there are no valid leaves.
            for h in 2..=degree {
                out.push(Node::new_leaf(*colors, h as u8));
            }
            continue;
        }

        let child_candidates = generate_subtrees_with_parent(depth - 1, degree, idx, cache);
        if child_candidates.is_empty() {
            continue;
        }

        for choice in nondecreasing_sequences(child_candidates.len() - 1, children_count) {
            let children = choice
                .into_iter()
                .map(|i| child_candidates[i].clone())
                .collect::<Vec<_>>();
            out.push(Node::new_internal(*colors, children));
        }
    }

    cache.insert(key, out.clone());
    out
}

/// Generates all colorings of the unique uniform tree of the given `depth` and `degree`.
///
/// - `depth` counts edges from the root to a leaf (so `depth = 0` yields a single node).
/// - `degree` includes the edge to the parent, so the root has `degree` children and every
///   other internal node has `degree - 1` children.
/// - Colors are chosen from `COLOR_SUBSETS_GE2`.
/// - Constraint: for every parent/child edge, `parent.colors` intersects `child.colors`.
pub fn generate_colored_uniform_trees(depth: usize, degree: usize) -> Vec<Node> {
    if degree < 2 {
        return Vec::new();
    }

    let root_children_count = if depth == 0 { 0 } else { degree };
    if depth > 0 && root_children_count == 0 {
        return Vec::new();
    }

    let mut cache: HashMap<(usize, usize, usize), Vec<Node>> = HashMap::new();
    let mut out: Vec<Node> = Vec::new();

    for &root_colors in ROOT_COLOR_SUBSETS.iter() {
        let Some(root_idx) = COLOR_SUBSETS_GE2.iter().position(|&s| s == root_colors) else {
            // If this ever happens, ROOT_COLOR_SUBSETS contains something not in COLOR_SUBSETS_GE2.
            continue;
        };

        if depth == 0 {
            // Root is a leaf: vary halfedges from 2..=degree.
            for h in 2..=degree {
                out.push(Node::new_leaf(root_colors, h as u8));
            }
            continue;
        }

        let child_candidates =
            generate_subtrees_with_parent(depth - 1, degree, root_idx, &mut cache);
        if child_candidates.is_empty() {
            continue;
        }

        for choice in nondecreasing_sequences(child_candidates.len() - 1, root_children_count) {
            let children = choice
                .into_iter()
                .map(|i| child_candidates[i].clone())
                .collect::<Vec<_>>();
            out.push(Node::new_internal(root_colors, children));
        }
    }

    out
}

fn node_to_json(node: &Node, out: &mut String) {
    out.push_str("{\"colors\":");
    out.push_str(&node.colors.to_string());
    out.push_str(",\"halfedges\":");
    out.push_str(&node.halfedges.to_string());
    out.push_str(",\"children\":[");
    for (i, child) in node.children.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        node_to_json(child, out);
    }
    out.push_str("]}");
}

fn colors_to_digits(colors: u8) -> String {
    let mut s = String::new();
    for c in 0..=3u8 {
        if (colors & (1u8 << c)) != 0 {
            s.push(char::from(b'0' + c));
        }
    }
    s
}

fn star_to_string(root: &Node, degree: usize) -> Option<String> {
    if root.children.len() != degree {
        return None;
    }
    if root.children.iter().any(|c| !c.children.is_empty()) {
        return None;
    }

    let mut s = format!("S{degree}");
    s.push_str("__");
    s.push_str(&root.halfedges.to_string());
    s.push('_');
    s.push_str(&colors_to_digits(root.colors));

    for child in root.children.iter() {
        s.push_str("__");
        s.push_str(&child.halfedges.to_string());
        s.push('_');
        s.push_str(&colors_to_digits(child.colors));
    }

    Some(s)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let depth: usize = match args.next().as_deref() {
        Some(s) => match s.parse() {
            Ok(v) => v,
            Err(_) => {
                eprintln!("invalid depth: {s}");
                return;
            }
        },
        None => {
            eprintln!("usage: rust <depth> <degree>");
            return;
        }
    };

    let degree: usize = match args.next().as_deref() {
        Some(s) => match s.parse() {
            Ok(v) => v,
            Err(_) => {
                eprintln!("invalid degree: {s}");
                return;
            }
        },
        None => {
            eprintln!("usage: rust <depth> <degree>");
            return;
        }
    };

    let trees = generate_colored_uniform_trees(depth, degree);

    // For stars (depth = 1), emit compact encoded strings instead of full JSON.
    if depth == 1 {
        let mut out = String::new();
        out.push('[');
        out.push('\n');
        for (i, t) in trees.iter().enumerate() {
            let Some(s) = star_to_string(t, degree) else {
                continue;
            };
            if i > 0 {
                out.push(',');
                out.push('\n');
            }
            out.push('"');
            out.push_str(&s);
            out.push('"');
        }
        out.push(']');
        println!("{out}");
        return;
    }

    let mut out = String::new();
    out.push('[');
    for (i, t) in trees.iter().enumerate() {
        if i > 0 {
            out.push(',');
            out.push('\n');
        }
        node_to_json(t, &mut out);
    }
    out.push(']');
    println!("{out}");
}
