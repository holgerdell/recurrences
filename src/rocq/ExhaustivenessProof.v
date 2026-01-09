From Coq Require Import List Bool Arith Sorting.Permutation.

Import ListNotations.
Open Scope nat_scope.

(*
  =========================================
  Basic finite universe
  =========================================
*)

Inductive Color := C1 | C2 | C3.
Scheme Equality for Color.

Definition Domain := list Color.
Definition Domain_eq_dec := list_eq_dec Color_eq_dec.
Definition Domain_beq d1 d2 := if Domain_eq_dec d1 d2 then true else false.

Definition intersect (d1 d2 : Domain) : Domain :=
  filter (fun c => if in_dec Color_eq_dec c d2 then true else false) d1.

(*
  Domain well-formedness:
  - no duplicates
  - only colors from {C1,C2,C3}
*)
Definition valid_domain (d : Domain) : Prop :=
  NoDup d /\
  forall c, In c d -> c = C1 \/ c = C2 \/ c = C3.

(*
  =========================================
  Local neighborhood summary
  =========================================
*)

Record NeighborInfo := {
  domain : Domain;
  half_edges : nat
}.

Definition NeighborInfo_eq_dec : forall (n1 n2 : NeighborInfo), {n1 = n2} + {n1 <> n2}.
Proof. decide equality; [apply Nat.eq_dec | apply Domain_eq_dec]. Defined.

Record LocalSituation := {
  root_domain : Domain;
  neighbors : list NeighborInfo
}.

(*)
  =========================================
  Additional structural constraints
  =========================================
*)

Definition reducible_situation (l : LocalSituation) : Prop :=
  length l.(root_domain) = 2 /\
  exists n1 n2,
    In n1 l.(neighbors) /\
    In n2 l.(neighbors) /\
    n1 <> n2 /\
    n1.(domain) = l.(root_domain) /\
    n1.(domain) = n2.(domain).

(*
  =========================================
  Local invariants
  =========================================
*)

Definition valid_neighbor (n : NeighborInfo) : Prop :=
  valid_domain n.(domain) /\
  n.(half_edges) >= 2.

(*)
  =========================================
  Node features and priority
  =========================================
*)

Inductive NodeRef :=
| Root (l : LocalSituation)
| Neighbor (n : NeighborInfo).

Definition list_size (r : NodeRef) : nat :=
  match r with
  | Root l => length l.(root_domain)
  | Neighbor n => length n.(domain)
  end.

Definition degree (r : NodeRef) : nat :=
  match r with
  | Root l => length l.(neighbors)
  | Neighbor n => n.(half_edges) + 1
  end.

(*
  priority n1 n2 means: n1 has higher priority than n2.
  We prioritize smaller list_size first; if list_size ties, we prioritize larger degree.
*)
Definition priority (n1 n2 : NodeRef) : Prop :=
  list_size n1 < list_size n2 \/
  (list_size n1 = list_size n2 /\ degree n1 > degree n2).

Definition valid_situation (l : LocalSituation) : Prop :=
  valid_domain l.(root_domain) /\
  ~ reducible_situation l /\
  (forall n,
    In n l.(neighbors) ->
    valid_domain n.(domain) /\
    intersect l.(root_domain) n.(domain) <> [] /\
    ~ priority (Neighbor n) (Root l)).

(*
  =========================================
  Concrete local situations
  =========================================
*)

(* A few example situations (not meant to be exhaustive yet). *)

Definition n_full_2 : NeighborInfo :=
  {| domain := [C1; C2; C3]; half_edges := 2 |}.

Definition n_12_2 : NeighborInfo :=
  {| domain := [C1; C2]; half_edges := 2 |}.

Definition example_star_deg3 : LocalSituation :=
  {| root_domain := [C1; C2; C3];
     neighbors := [n_full_2; n_full_2; n_full_2] |}.

Definition example_star_deg4 : LocalSituation :=
  {| root_domain := [C1; C2; C3];
     neighbors := [n_full_2; n_full_2; n_full_2; n_full_2] |}.

Definition example_root12_mixed : LocalSituation :=
  {| root_domain := [C1; C2];
     neighbors := [n_full_2; n_12_2; n_full_2] |}.

Definition concrete_situations : list LocalSituation :=
  [example_star_deg3; example_star_deg4; example_root12_mixed].

(*
  =========================================
  Isomorphism of local situations
  =========================================

  We consider two situations isomorphic if one can be obtained from the other by:
  - permuting the color universe (a bijection Color -> Color), and
  - arbitrarily reordering the neighbor list.
*)

Record ColorPerm := {
  perm : Color -> Color;
  inv : Color -> Color;
  perm_left_inv : forall c, inv (perm c) = c;
  perm_right_inv : forall c, perm (inv c) = c
}.

Definition perm_domain (p : Color -> Color) (d : Domain) : Domain :=
  map p d.

Definition perm_neighbor (p : Color -> Color) (n : NeighborInfo) : NeighborInfo :=
  {| domain := perm_domain p n.(domain); half_edges := n.(half_edges) |}.

Definition neighbor_iso (p : Color -> Color) (n1 n2 : NeighborInfo) : Prop :=
  n2.(half_edges) = n1.(half_edges) /\
  Permutation n2.(domain) (perm_domain p n1.(domain)).

Definition situations_are_isomorphic (l1 l2 : LocalSituation) : Prop :=
  exists p : ColorPerm,
    Permutation l2.(root_domain) (perm_domain p.(perm) l1.(root_domain)) /\
    PermutationA (neighbor_iso p.(perm)) l1.(neighbors) l2.(neighbors).

(*
  =========================================
  COMPLETENESS / EXHAUSTIVENESS
  =========================================
*)

Lemma local_situations_exhaustive :
  forall l,
    valid_situation l ->
    exists l0,
      In l0 concrete_situations /\
      situations_are_isomorphic l l0.
Proof.
  (*
    This is the key proof:
    - destruct root_domain (finite!)
    - analyze neighbor multiset
    - use invariants to rule out impossible cases
  *)
Admitted.