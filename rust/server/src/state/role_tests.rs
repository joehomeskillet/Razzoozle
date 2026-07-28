use super::socket_role::{release, try_claim, VerifiedRole};

/// Same socket cannot hold two different roles at once.
#[test]
fn exclusivity_same_socket_cannot_hold_two_roles() {
    let sid = "role-test-exclusivity-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    assert!(try_claim(sid, VerifiedRole::Manager).is_ok());
    assert_eq!(
        try_claim(sid, VerifiedRole::Player),
        Err(VerifiedRole::Manager)
    );
    release(sid);
}

/// Refused switch Player -> Manager on the same socket.
#[test]
fn refused_switch_player_to_manager() {
    let sid = "role-test-switch-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    assert!(try_claim(sid, VerifiedRole::Player).is_ok());
    assert_eq!(
        try_claim(sid, VerifiedRole::Manager),
        Err(VerifiedRole::Player)
    );
    release(sid);
}

/// Claiming the same role twice on the same socket is idempotent.
#[test]
fn idempotent_same_role_claim() {
    let sid = "role-test-idempotent-cccccccc-cccc-cccc-cccc-cccccccccccc";
    assert!(try_claim(sid, VerifiedRole::Display).is_ok());
    assert!(try_claim(sid, VerifiedRole::Display).is_ok());
    release(sid);
}

/// After a failed claim, the original role remains bound.
#[test]
fn rollback_after_conflict_keeps_original_role() {
    let sid = "role-test-rollback-dddddddd-dddd-dddd-dddd-dddddddddddd";
    assert!(try_claim(sid, VerifiedRole::Manager).is_ok());
    assert_eq!(
        try_claim(sid, VerifiedRole::Player),
        Err(VerifiedRole::Manager)
    );
    // Original role still bound: re-claim with original role is Ok.
    assert!(try_claim(sid, VerifiedRole::Manager).is_ok());
    // And a different role is still refused.
    assert_eq!(
        try_claim(sid, VerifiedRole::Display),
        Err(VerifiedRole::Manager)
    );
    release(sid);
}

/// release() twice is safe; a later claim may take any role.
#[test]
fn release_is_idempotent() {
    let sid = "role-test-release-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    assert!(try_claim(sid, VerifiedRole::Player).is_ok());
    release(sid);
    release(sid);
    assert!(try_claim(sid, VerifiedRole::Manager).is_ok());
    release(sid);
}

/// release() on an unknown socket is a no-op (no panic).
#[test]
fn release_unknown_socket_is_noop() {
    let sid = "role-test-unknown-ffffffff-ffff-ffff-ffff-ffffffffffff";
    release(sid);
    release(sid);
}

/// Two different socket_ids may hold different roles concurrently (Decision 1).
#[test]
fn multi_socket_may_hold_different_roles() {
    let sid_a = "role-test-multisocket-a-11111111-1111-1111-1111-111111111111";
    let sid_b = "role-test-multisocket-b-22222222-2222-2222-2222-222222222222";
    assert!(try_claim(sid_a, VerifiedRole::Manager).is_ok());
    assert!(try_claim(sid_b, VerifiedRole::Player).is_ok());
    release(sid_a);
    release(sid_b);
}
