(function (EXPORTS) {
  "use strict";
  const dogeBlockchainAPI = EXPORTS;

  const DEFAULT = {
    fee: 0.09,
  };

  //Get balance for the given Address
  dogeBlockchainAPI.getBalance = function (addr) {
    return new Promise((resolve, reject) => {
      fetch(
        `https://go.getblock.io/b05a36f1d01d401196afbb1d3957a9f3/api/address/${addr}`
      )
        .then((response) => {
          if (!response.ok)
            throw new Error(`HTTP error! Status: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          console.log("Balance data:", data);
          if (data && typeof data.balance !== "undefined")
            resolve(parseFloat(data.balance));
          else reject("Balance not found in response");
        })
        .catch((error) => reject(error));
    });
  };

  // Helper function to get UTXOs for an address
  const getUTXOs = async (addr) => {
    const url = `https://go.getblock.io/b05a36f1d01d401196afbb1d3957a9f3/api/address/${addr}?details=txs`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.txs) throw new Error("No transactions found for address");

    const utxos = [];
    data.txs.forEach((tx) => {
      tx.vout.forEach((vout) => {
        const addresses =
          vout.addresses ||
          (vout.scriptPubKey ? vout.scriptPubKey.addresses : []);
        if (
          !vout.spent &&
          vout.scriptPubKey &&
          vout.scriptPubKey.hex &&
          addresses &&
          addresses.some((a) => a.toLowerCase() === addr.toLowerCase())
        ) {
          console.log("Found UTXO:", {
            txid: tx.txid,
            vout: vout.n,
            value: parseFloat(vout.value),
          });

          utxos.push({
            txid: tx.txid,
            vout: vout.n,
            value: parseFloat(vout.value),
            scriptPubKey: vout.scriptPubKey.hex,
          });
        }
      });
    });
    return utxos;
  };

  function toDOGE(val) {
    if (typeof val === "string" && val.includes("DOGE")) {
      return parseFloat(val.replace("DOGE", "").trim());
    }

    const num = parseFloat(val || "0");

    return isNaN(num) ? 0 : num;
  }

  /**
   * Get transaction history for a Dogecoin address
   * @param {string} address - The Dogecoin address to check
   * @param {Object} options - Optional parameters
   * @param {number} options.limit - Number of transactions to retrieve (default: 10)
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise} Promise object that resolves with transaction list
   */
  dogeBlockchainAPI.getDogeTransactions = function (address, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`Fetching transaction history for: ${address}`);
      fetch(
        `https://go.getblock.io/b05a36f1d01d401196afbb1d3957a9f3/api/address/${address}?details=txs`
      )
        .then((response) => {
          if (!response.ok) {
            if (response.status === 429) {
              throw new Error(
                "API rate limit exceeded. Please try again later."
              );
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then(async (data) => {
          console.log("Raw API response data:", data);
          const txs = data.txs || [];
          const txids = txs.map((tx) => tx.txid) || [];
          console.log(
            `Found ${txids.length} transactions for address ${address}`
          );
          const limit = options.limit || 10;
          const offset = options.offset || 0;

          const maxTxToProcess = Math.min(10, limit);
          const txsToProcess = txs.slice(offset, offset + maxTxToProcess);

          if (txsToProcess.length === 0) {
            console.log("No transactions to process based on offset/limit");
            resolve({
              transactions: [],
              total: txs.length,
              offset: offset,
              limit: limit,
            });
            return;
          }

          console.log(`Processing ${txsToProcess.length} transactions`);

          const transactions = txsToProcess;
          console.log("Transactions to process:", transactions);

          try {
            const processedTransactions = transactions.map((tx) => {
              const inputs = tx.vin || [];
              const outputs = tx.vout || [];

              // Check if address is sender (in vin)
              const isSender = inputs.some((i) =>
                i.addresses?.includes(address)
              );

              // Check if address is receiver (in vout)
              const isReceiver = outputs.some(
                (o) =>
                  (o.addresses && o.addresses.includes(address)) ||
                  (o.scriptPubKey?.addresses &&
                    o.scriptPubKey.addresses.includes(address))
              );

              let type = "unknown";
              let value = 0;
              let fromAddresses = [];
              let toAddresses = [];

              // Extract sender addresses (from)
              inputs.forEach((input) => {
                if (input.addresses && input.addresses.length > 0) {
                  input.addresses.forEach((addr) => {
                    if (!fromAddresses.includes(addr)) {
                      fromAddresses.push(addr);
                    }
                  });
                }
              });

              // Extract recipient addresses (to)
              outputs.forEach((output) => {
                const outAddresses =
                  output.addresses ||
                  (output.scriptPubKey ? output.scriptPubKey.addresses : []);

                if (outAddresses && outAddresses.length > 0) {
                  outAddresses.forEach((addr) => {
                    if (!toAddresses.includes(addr)) {
                      toAddresses.push(addr);
                    }
                  });
                }
              });

              if (isSender && isReceiver) {
                type = "self";

                const totalInput = inputs
                  .filter((i) => i.addresses?.includes(address))
                  .reduce((sum, i) => sum + toDOGE(i.value), 0);

                const totalOutput = outputs
                  .filter(
                    (o) =>
                      (o.addresses && o.addresses.includes(address)) ||
                      (o.scriptPubKey?.addresses &&
                        o.scriptPubKey.addresses.includes(address))
                  )
                  .reduce((sum, o) => sum + toDOGE(o.value), 0);

                value = totalOutput - totalInput;
              } else if (isSender) {
                type = "sent";

                const totalInput = inputs
                  .filter((i) => i.addresses?.includes(address))
                  .reduce((sum, i) => sum + toDOGE(i.value), 0);

                const changeBack = outputs
                  .filter(
                    (o) =>
                      (o.addresses && o.addresses.includes(address)) ||
                      (o.scriptPubKey?.addresses &&
                        o.scriptPubKey.addresses.includes(address))
                  )
                  .reduce((sum, o) => sum + toDOGE(o.value), 0);

                value = -(totalInput - changeBack);
              } else if (isReceiver) {
                type = "received";

                value = outputs
                  .filter(
                    (o) =>
                      (o.addresses && o.addresses.includes(address)) ||
                      (o.scriptPubKey?.addresses &&
                        o.scriptPubKey.addresses.includes(address))
                  )
                  .reduce((sum, o) => sum + toDOGE(o.value), 0);
              }

              console.log(`Transaction ${tx.txid} time data:`, {
                blockTime: tx.blocktime,
                blockheight: tx.blockheight,
                time: tx.time,
              });

              const timestamp =
                tx.time ||
                tx.blockTime ||
                (tx.confirmations
                  ? Math.floor(Date.now() / 1000) - tx.confirmations * 600
                  : Math.floor(Date.now() / 1000));

              return {
                txid: tx.txid,
                type,
                value: value.toFixed(8),
                time: timestamp,
                blockHeight: tx.blockheight,
                formattedTime: new Date(timestamp * 1000).toLocaleString(),
                confirmations: tx.confirmations || 0,
                rawTx: tx.hex,
                fromAddresses: fromAddresses,
                toAddresses: toAddresses,
              };
            });

            if (processedTransactions.length > 0) {
              console.log(
                "Sample transaction processed:",
                processedTransactions[0]
              );

              console.log("Raw transaction data:", transactions[0]);
            } else {
              console.log("No transactions were processed successfully");
              console.log("Original txids found:", txids);
            }
            resolve({
              transactions: processedTransactions,
              total: txids.length,
              offset: offset,
              limit: limit,
            });
          } catch (error) {
            console.error("Error processing transactions:", error);
            reject(error);
          }
        })
        .catch((error) => {
          console.error("API Error:", error);
          reject(error);
        });
    });
  };

  /**
   * Send Dogecoin transaction using direct RPC calls to GetBlock.io
   * This method implements the full RPC workflow: createrawtransaction -> signrawtransaction -> sendrawtransaction
   * @param {string} senderAddr - Sender's Dogecoin address
   * @param {string} receiverAddr - Receiver's Dogecoin address
   * @param {number} sendAmt - Amount to send in DOGE
   * @param {string} privKey - Private key of the sender
   * @returns {Promise} Promise that resolves with the transaction ID
   */
  dogeBlockchainAPI.sendDogecoinRPC = function (
    senderAddr,
    receiverAddr,
    sendAmt,
    privKey
  ) {
    return new Promise((resolve, reject) => {
      if (!dogeCrypto.validateDogeID(senderAddr, true))
        return reject(`Invalid sender address: ${senderAddr}`);
      if (!dogeCrypto.validateDogeID(receiverAddr))
        return reject(`Invalid receiver address: ${receiverAddr}`);
      if (typeof sendAmt !== "number" || sendAmt <= 0)
        return reject(`Invalid send amount: ${sendAmt}`);
      if (privKey.length < 1 || !dogeCrypto.verifyPrivKey(privKey, senderAddr))
        return reject("Invalid Private key!");

      const fee = DEFAULT.fee;
      const apiToken = "c9888622feab498ab709c20ea8646bf0";
      const rpcEndpoint = `https://go.getblock.io/${apiToken}/`;

      async function rpc(method, params = []) {
        const res = await fetch(rpcEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
        });
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data.error) throw new Error(JSON.stringify(data.error));
          return data.result;
        } catch (err) {
          console.error("Raw RPC response:\n", text);
          throw new Error("Failed to parse JSON-RPC response");
        }
      }

      // Get UTXOs for the address
      getUTXOs(senderAddr)
        .then(async (utxos) => {
          if (utxos.length === 0) return reject("No valid UTXOs found");
          console.log("Found UTXOs:", utxos);

          const utxoTotal = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
          console.log("Total UTXO value:", utxoTotal);

          if (utxoTotal < sendAmt + fee)
            return reject(
              `Insufficient funds: ${utxoTotal} < ${sendAmt + fee}`
            );

          const inputs = utxos.map((utxo) => ({
            txid: utxo.txid,
            vout: utxo.vout,
          }));

          console.log("inputs:", inputs);

          // Calculate change amount
          const change = utxoTotal - sendAmt - fee;

          const outputs = {
            [senderAddr]: Number(change.toFixed(8)),
            [receiverAddr]: Number(sendAmt.toFixed(8)),
          };
          console.log("outputs:", outputs);

          try {
            // Create raw transaction
            console.log("Creating raw transaction...");
            const rawTx = await rpc("createrawtransaction", [inputs, outputs]);
            console.log("Raw transaction hex:", rawTx);
            // Sign raw transaction
            console.log("Signing transaction...");
            const signedTx = await rpc("signrawtransaction", [
              rawTx,
              [
                {
                  txid: utxos[0].txid,
                  vout: utxos[0].vout,
                  scriptPubKey: utxos[0].scriptPubKey,
                  amount: utxos[0].value.toFixed(8),
                },
              ],
              [privKey],
            ]);

            if (!signedTx.complete) {
              return reject(
                `Failed to sign transaction: ${JSON.stringify(signedTx.errors)}`
              );
            }
            console.log("Signed transaction hex:", signedTx.hex);

            // Send raw transaction
            console.log("Broadcasting transaction...");
            const txid = await rpc("sendrawtransaction", [signedTx.hex]);

            resolve(txid);
          } catch (error) {
            console.error("RPC error:", error);
            reject(error);
          }
        })
        .catch((error) => reject(error));
    });
  };
  /**
   * Get transaction details by transaction ID
   * @param {string} txid - The transaction ID to look up
   * @returns {Promise} Promise object that resolves with transaction details
   */
  dogeBlockchainAPI.getTransactionDetails = function (txid) {
    return new Promise((resolve, reject) => {
      if (!txid || typeof txid !== "string" || txid.length !== 64) {
        reject(new Error("Invalid transaction ID format"));
        return;
      }

      console.log(`Fetching transaction details for txid: ${txid}`);

      fetch(
        `https://go.getblock.io/b05a36f1d01d401196afbb1d3957a9f3/api/tx/${txid}`
      )
        .then((response) => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error("Transaction not found");
            } else if (response.status === 429) {
              throw new Error(
                "API rate limit exceeded. Please try again later."
              );
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("Transaction details data:", data);

          if (!data || !data.txid) {
            throw new Error("Invalid transaction data returned");
          }

          const processedData = {
            txid: data.txid,
            blockHeight: data.blockheight,
            blockHash: data.blockhash,
            blockTime: data.blocktime
              ? new Date(data.blocktime * 1000).toLocaleString()
              : "Pending",
            confirmations: data.confirmations || 0,
            fees: data.fees,
            size: data.size,
            inputsCount: data.vin ? data.vin.length : 0,
            outputsCount: data.vout ? data.vout.length : 0,
            totalInput: 0,
            totalOutput: 0,
            inputs: [],
            outputs: [],
          };

          // Process inputs
          if (data.vin && Array.isArray(data.vin)) {
            data.vin.forEach((input) => {
              const inputValue = parseFloat(input.value || 0);
              processedData.totalInput += inputValue;

              const inputData = {
                txid: input.txid,
                vout: input.vout,
                addresses: input.addresses || [],
                value: inputValue,
              };

              processedData.inputs.push(inputData);
            });
          }

          // Process outputs
          if (data.vout && Array.isArray(data.vout)) {
            data.vout.forEach((output) => {
              const outputValue = parseFloat(output.value || 0);
              processedData.totalOutput += outputValue;

              const addresses =
                output.scriptPubKey && output.scriptPubKey.addresses
                  ? output.scriptPubKey.addresses
                  : [];

              const outputData = {
                n: output.n,
                addresses: addresses,
                value: outputValue,
                spent: output.spent || false,
                scriptPubKey: output.scriptPubKey
                  ? output.scriptPubKey.hex
                  : "",
              };

              processedData.outputs.push(outputData);
            });
          }

          resolve(processedData);
        })
        .catch((error) => {
          console.error("Error fetching transaction details:", error);
          reject(error);
        });
    });
  };
})(
  "object" === typeof module ? module.exports : (window.dogeBlockchainAPI = {})
);
