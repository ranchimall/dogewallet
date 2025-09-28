(function (EXPORTS) {
  
  "use strict";
  const dogeCrypto = EXPORTS;


  //Generates a new flo ID and returns private-key, public-key and floID
  const generateNewID = (dogeCrypto.generateNewID = function () {
    var key = new Bitcoin.ECKey(false);
    key.setCompressed(true);
    return {
      floID: key.getBitcoinAddress(),
      pubKey: key.getPubKeyHex(),
      privKey: key.getBitcoinWalletImportFormat(),
    };
  });

  Object.defineProperties(dogeCrypto, {
    newID: {
      get: () => generateNewID(),
    },
    hashID: {
      value: (str) => {
        let bytes = ripemd160(Crypto.SHA256(str, { asBytes: true }), {
          asBytes: true,
        });
        bytes.unshift(bitjs.pub);
        var hash = Crypto.SHA256(
          Crypto.SHA256(bytes, {
            asBytes: true,
          }),
          {
            asBytes: true,
          }
        );
        var checksum = hash.slice(0, 4);
        return bitjs.Base58.encode(bytes.concat(checksum));
      },
    },
    tmpID: {
      get: () => {
        let bytes = Crypto.util.randomBytes(20);
        bytes.unshift(bitjs.pub);
        var hash = Crypto.SHA256(
          Crypto.SHA256(bytes, {
            asBytes: true,
          }),
          {
            asBytes: true,
          }
        );
        var checksum = hash.slice(0, 4);
        return bitjs.Base58.encode(bytes.concat(checksum));
      },
    },
  });

  

  //Verify the private-key for the given public-key or doge-ID
  dogeCrypto.verifyPrivKey = function (privateKeyWIF, dogeAddress) {
    if (!privateKeyWIF || !dogeAddress) return false;
    try {
      var derivedAddress =
        dogeCrypto.generateMultiChain(privateKeyWIF).DOGE.address;
      return derivedAddress === dogeAddress;
    } catch (e) {
      console.error("verifyPrivKey error:", e);
      return false;
    }
  };

  //Check if the given doge-id is valid or not
  dogeCrypto.validateDogeID = function (dogeID) {
    if (!dogeID) return false;
    try {
      // Decode Base58Check
      let bytes = bitjs.Base58.decode(dogeID);
      if (!bytes || bytes.length < 25) return false;
      let version = bytes[0];

      return version === 0x1e;
    } catch (e) {
      return false;
    }
  };

  //Generates multi-chain addresses (DOGE, BTC, FLO, LTC) from the given WIF or new WIF
  dogeCrypto.generateMultiChain = function (inputWif) {
    try {
        const origBitjsPub = bitjs.pub;
        const origBitjsPriv = bitjs.priv;
        const origBitjsCompressed = bitjs.compressed;
        const origCoinJsCompressed = coinjs.compressed;

        bitjs.compressed = true;
        coinjs.compressed = true;

        const versions = {
            DOGE: { pub: 0x1e, priv: 0x9e },
            BTC: { pub: 0x00, priv: 0x80 },
            FLO: { pub: 0x23, priv: 0xa3 },
            LTC: { pub: 0x30, priv: 0xb0 },
        };

        let privKeyHex;
        let compressed = true; 
        
        if (typeof inputWif === "string" && inputWif.length > 0) {
            const decode = Bitcoin.Base58.decode(inputWif);
            const keyWithVersion = decode.slice(0, decode.length - 4);
            let key = keyWithVersion.slice(1);
            
            if (key.length >= 33 && key[key.length - 1] === 0x01) {
                key = key.slice(0, key.length - 1);
                compressed = true;
            } else {
                compressed = false;
            }
            
            privKeyHex = Crypto.util.bytesToHex(key);
        } else {
            const newKey = generateNewID();
            const decode = Bitcoin.Base58.decode(newKey.privKey);
            const keyWithVersion = decode.slice(0, decode.length - 4);
            let key = keyWithVersion.slice(1);
            
            if (key.length >= 33 && key[key.length - 1] === 0x01) {
                key = key.slice(0, key.length - 1);
            }
            
            privKeyHex = Crypto.util.bytesToHex(key);
        }
        
        bitjs.compressed = compressed;
        coinjs.compressed = compressed;
        
        // Generate public key
        const pubKey = bitjs.newPubkey(privKeyHex);

        const result = {
            DOGE: { address: "", privateKey: "" },
            BTC: { address: "", privateKey: "" },
            FLO: { address: "", privateKey: "" },
            LTC: { address: "", privateKey: "" },
        };

        // For DOGE
        bitjs.pub = versions.DOGE.pub;
        bitjs.priv = versions.DOGE.priv;
        result.DOGE.address = bitjs.pubkey2address(pubKey);
        result.DOGE.privateKey = bitjs.privkey2wif(privKeyHex);

        // For BTC
        bitjs.pub = versions.BTC.pub;
        bitjs.priv = versions.BTC.priv;
        result.BTC.address = coinjs.bech32Address(pubKey).address;
        result.BTC.privateKey = bitjs.privkey2wif(privKeyHex);

        // For FLO
        bitjs.pub = versions.FLO.pub;
        bitjs.priv = versions.FLO.priv;
        result.FLO.address = bitjs.pubkey2address(pubKey);
        result.FLO.privateKey = bitjs.privkey2wif(privKeyHex);

        // For LTC
        bitjs.pub = versions.LTC.pub;
        bitjs.priv = versions.LTC.priv;
        result.LTC.address = bitjs.pubkey2address(pubKey);
        result.LTC.privateKey = bitjs.privkey2wif(privKeyHex);

        bitjs.pub = origBitjsPub;
        bitjs.priv = origBitjsPriv;
        bitjs.compressed = origBitjsCompressed;
        coinjs.compressed = origCoinJsCompressed;

        return result;
    } catch (error) {
        console.error("Error in generateMultiChain:", error);
        throw error;
    }
};

  /**
   * Translates an address from one blockchain to equivalent addresses on other chains
   * Works by extracting the public key hash from the address and recreating addresses with different version bytes
   */
  dogeCrypto.translateAddress = function (address) {
    try {
      let sourceChain = null;

      if (address.startsWith("bc1")) {
        sourceChain = "BTC";
      } else if (address.startsWith("D")) {
        sourceChain = "DOGE";
      } else if (address.startsWith("F")) {
        sourceChain = "FLO";
      } else if (address.startsWith("L")) {
        sourceChain = "LTC";
      } else {
        throw new Error("Unsupported address format");
      }

      let decoded, hash160;

      if (sourceChain === "BTC") {
        decoded = coinjs.bech32_decode(address);
        if (!decoded) throw new Error("Invalid bech32 address");

        // For segwit addresses, convert from 5-bit to 8-bit
        const data = coinjs.bech32_convert(decoded.data.slice(1), 5, 8, false);
        hash160 = Crypto.util.bytesToHex(data);
      } else {
        // Handle DOGE and FLO addresses (Base58)
        const decodedBytes = Bitcoin.Base58.decode(address);
        if (!decodedBytes || decodedBytes.length < 25)
          throw new Error("Invalid address");

        // Remove version byte (first byte) and checksum (last 4 bytes)
        const bytes = decodedBytes.slice(1, decodedBytes.length - 4);
        hash160 = Crypto.util.bytesToHex(bytes);
      }

      if (!hash160) throw new Error("Could not extract hash160 from address");

      const versions = {
        DOGE: 0x1e,
        FLO: 0x23,
        BTC: 0x00,
        LTC: 0x30,
      };

      const result = {};

      // Generate address for DOGE
      const dogeBytes = Crypto.util.hexToBytes(hash160);
      dogeBytes.unshift(versions.DOGE);
      const dogeChecksum = Crypto.SHA256(
        Crypto.SHA256(dogeBytes, { asBytes: true }),
        { asBytes: true }
      ).slice(0, 4);
      result.DOGE = Bitcoin.Base58.encode(dogeBytes.concat(dogeChecksum));

      // Generate address for FLO
      const floBytes = Crypto.util.hexToBytes(hash160);
      floBytes.unshift(versions.FLO);
      const floChecksum = Crypto.SHA256(
        Crypto.SHA256(floBytes, { asBytes: true }),
        { asBytes: true }
      ).slice(0, 4);
      result.FLO = Bitcoin.Base58.encode(floBytes.concat(floChecksum));

      // Generate address for BTC
      try {
        const words = coinjs.bech32_convert(
          Crypto.util.hexToBytes(hash160),
          8,
          5,
          true
        );
        result.BTC = coinjs.bech32_encode("bc", [0].concat(words));
      } catch (e) {
        console.log("Could not generate segwit address:", e);
      }

      // Generate address for LTC
      const ltcBytes = Crypto.util.hexToBytes(hash160);
      ltcBytes.unshift(versions.LTC);
      const ltcChecksum = Crypto.SHA256(
        Crypto.SHA256(ltcBytes, { asBytes: true }),
        { asBytes: true }
      ).slice(0, 4);
      result.LTC = Bitcoin.Base58.encode(ltcBytes.concat(ltcChecksum));

      return result;
    } catch (err) {
      console.error("Address translation error:", err);
      throw new Error("Address translation failed: " + err.message);
    }
  };
})("object" === typeof module ? module.exports : (window.dogeCrypto = {}));
