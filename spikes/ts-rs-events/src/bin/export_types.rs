use ts_rs::TS;
use ts_rs_events::*;

fn main() {
    // Export all types to TypeScript
    let ts_types = format!(
        "/* Auto-generated TypeScript types from Rust using ts-rs */\n\n{}{}{}",
        QuestionMediaType::decl(),
        QuestionMedia::decl(),
        SelectAnswerPayload::decl()
    );

    println!("{}", ts_types);

    // Also write to a file
    std::fs::write("generated_types.ts", ts_types).expect("Failed to write generated_types.ts");
    println!("\n✓ Exported to generated_types.ts");
}
