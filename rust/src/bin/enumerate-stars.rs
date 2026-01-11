use recurrences::star_utils::generate_stars;
use recurrences::star_utils::star_to_string;

fn main() {
    let mut args = std::env::args().skip(1);
    let degree: usize = match args.next().as_deref() {
        Some(s) => match s.parse() {
            Ok(v) => v,
            Err(_) => {
                eprintln!("invalid degree: {s}");
                return;
            }
        },
        None => {
            eprintln!("usage: enumerate-stars <degree>");
            return;
        }
    };

    for d in 3..(degree + 1) {
        for t in generate_stars(d).iter() {
            let Some(s) = star_to_string(t) else {
                continue;
            };
            println!("{s}");
        }
    }
}
