/**
 * 
 * @param {Buffer} secret 
 */
function solveRiddle(secret) {
    
    let scriptToRun = '';
    const idba = new Uint8Array(24);

    for(let d = 0, e = 23, b, f = 0, g = 0; g < secret.length;) {
        b = secret[g];
        g++;

        if (96 >= b) {
            b += 32;
        }

        b = (b - 97 - e) % 26;
        
        if (0 > b) {
            b += 26;
        }

        d *= 16;
        d += b;
        e += 17;

        if (1 === f) {
            scriptToRun += String.fromCharCode(d);
            f = d = 0;
        } else {
            f++;
        }
    }

    (()=>{ eval(scriptToRun); })();

    if (0 < idba.length) {
        for(let b = 0, a, e, c = 0; c < idba.length; c++) {
            d = 65;
            a = idba[c];

            if (97 <= a) {
                d += 32; 
                a -= 32;
            }

            a -= 65;

            if (0 == c) {
                b = 2 + a;
            }

            e = a + b;

            e %= 26;

            b += 3 + a;

            idba[c] = e + d;
        }
    }

    return Buffer.from(idba);
}

module.exports = solveRiddle;