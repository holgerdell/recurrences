From Coq Require Import List Bool Arith.

Import ListNotations.
Open Scope nat_scope.

(*
  =========================================
  Basic finite universe
  =========================================
*)

Inductive Color := C1 | C2 | C3 | C4.
Scheme Equality for Color.

Definition Domain := list Color.
Definition Domain_eq_dec := list_eq_dec Color_eq_dec.
Definition Domain_beq d1 d2 := if Domain_eq_dec d1 d2 then true else false.

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

(*
  =========================================
  Local invariants
  =========================================
*)

Definition valid_neighbor (n : NeighborInfo) : Prop :=
  valid_domain n.(domain) /\
  n.(half_edges) > 0.

Definition valid_local (l : LocalSituation) : Prop :=
  valid_domain l.(root_domain) /\
  Forall valid_neighbor l.(neighbors).

(*
  =========================================
  Named local cases
  =========================================
*)

Inductive LocalCase :=
| CaseExample
| CaseA
| CaseB.

Definition count_n (l : LocalSituation) (d : Domain) (e : nat) : nat :=
  count_occ NeighborInfo_eq_dec l.(neighbors) {| domain := d; half_edges := e |}.

Definition case_exampleb (l : LocalSituation) : bool :=
  Domain_beq l.(root_domain) [C1; C2] &&
  (count_n l [C1; C2] 2 =? 1) &&
  (count_n l [C1; C3] 2 =? 3).

Definition case_Ab (l : LocalSituation) : bool := false.
Definition case_Bb (l : LocalSituation) : bool := false.

Definition classify (l : LocalSituation) : option LocalCase :=
  if case_exampleb l then Some CaseExample
  else if case_Ab l then Some CaseA
  else if case_Bb l then Some CaseB
  else None.

(*
  =========================================
  COMPLETENESS / EXHAUSTIVENESS
  =========================================
*)

Lemma local_cases_exhaustive :
  forall l,
    valid_local l ->
    exists c, classify l = Some c.
Proof.
  (*
    This is the key proof:
    - destruct root_domain (finite!)
    - analyze neighbor multiset
    - use invariants to rule out impossible cases
  *)
Admitted.