require 'net/http'
require 'cgi'
require 'json'
require 'terminal-table'
require 'dotenv'
require 'date_core'

# https://support.exactonline.com/community/s/knowledge-base#All-All-DNO-Content-restrefdocs
# https://start.exactonline.nl/docs/HlpRestAPIResources.aspx?SourceAction=10

# gem install net-http dotenv pry cgi pp json terminal-table ocran
# gem pristine cgi --version 0.4.1
# rubocop:disable Metrics/ClassLength
# rubocop:disable Metrics/MethodLength
# rubocop:disable Metrics/AbcSize

class Exact
  def initialize

    secrets = File.join(Dir.pwd, '.secrets')
    unless File.exist?(secrets)
      puts "\n\n\t Geen .secrets bestand gevonden.\n\n"
      exit
    end
    Dotenv.load(File.join(Dir.pwd, '.secrets'))


    data_dir = File.join(Dir.pwd, 'data')
    Dir.mkdir(data_dir) unless File.exist?(data_dir)

    @cache = false

    @api = ENV.fetch('API')
    @client_id = ENV.fetch('CLIENT_ID')
    @client_secret = ENV.fetch('CLIENT_SECRET')
    @redirect_uri = ENV.fetch('REDIRECT_URI')
    @division = ENV.fetch('DIVISION')
    @divisions = nil
    @access_token = nil
    @refresh_token = nil
    @refresh_at = Time.now

    tokens = begin
      JSON.parse(File.read(File.join(Dir.pwd, 'tokens.json')))
    rescue StandardError
      nil
    end
    if tokens
      @access_token = tokens['access_token']
      @refresh_token = tokens['refresh_token']
      @refresh_at = DateTime.parse(tokens['refresh_at']).to_time
    end

    start
  rescue StandardError
    "\n\n\nEr ging iets mis, je kunt dit scherm sluiten\n"
  end

  def start
    authenticate if @refresh_token.nil?
    set_division
    get_transactions

    puts "\n\n\tNog een?\n\n\t1. Ja\n\t2. Nee\n\n"
    if gets.strip.to_i == 1
      start
    else
      puts "\n\nTot ziens!\n\n"
    end
  end

  def set_division
    keys = %w[Code CustomerName Description]
    rows = get_divisions
           .sort_by { |d| d['CustomerName'] + d['Description'] }
           .map { |d| d.slice(*keys).values }
    table = Terminal::Table.new title: 'Divisons (klanten)', headings: keys, rows: rows
    table.align_column(0, :right)
    puts table

    puts "\n\nKies een klant en voer het nummer hieronder in:\n"
    division = gets.strip.to_i

    exit if division.zero?

    if get_divisions.map { |d| d['Code'] }.include?(division)
      @division = division
    else
      puts "\nKlant niet gevonden, opnieuw.\n\n"
      sleep 1
      set_division
    end
  end

  def get_divisions
    @divisions = JSON.parse(File.read(File.join(Dir.pwd, 'data', 'divisions.json'))) if @cache

    # https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=SystemSystemAllDivisions
    attributes = 'Code,Customer,CustomerCode,CustomerName,Description'
    @divisions ||= get_results("/v1/#{@division}/system/Divisions?$select=#{attributes}")
    File.write(File.join(Dir.pwd, 'data', 'divisions.json'), JSON.pretty_generate(@divisions))
    @divisions
  end

  def get_transactions
    results = JSON.parse(File.read(File.join(Dir.pwd, 'data', 'transactions_cache.json'))) if @cache

    # https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=BulkFinancialTransactionLines
    filter = set_filter
    filter = filter.strip.empty? ? '' : "&$filter=#{filter}"

    attributes = 'AccountCode,AccountName,AmountDC,AmountFC,AmountVATBaseFC,AmountVATFC,AssetCode,AssetDescription,CostCenter,CostCenterDescription,CostUnit,CostUnitDescription,CreatorFullName,Currency,CustomField,Description,Division,Document,DocumentNumber,DocumentSubject,DueDate,EntryNumber,ExchangeRate,ExternalLinkDescription,ExternalLinkReference,ExtraDutyAmountFC,ExtraDutyPercentage,FinancialPeriod,FinancialYear,GLAccountCode,GLAccountDescription,InvoiceNumber,Item,ItemCode,ItemDescription,JournalCode,JournalDescription,LineType,Modified,ModifierFullName,Notes,OrderNumber,PaymentDiscountAmount,PaymentReference,Project,ProjectCode,ProjectDescription,Quantity,SerialNumber,ShopOrder,Status,Subscription,SubscriptionDescription,TrackingNumber,TrackingNumberDescription,Type,VATCode,VATCodeDescription,VATPercentage,VATType,YourRef'
    results ||= get_results("/v1/#{@division}/bulk/Financial/TransactionLines?$select=#{attributes}#{filter}")

    path = File.join(Dir.pwd, 'data', "#{@division}-transactions.json")
    File.write(path, JSON.pretty_generate(results))

    puts "\n\nBestand aangemaakt: #{path}\n\n"

    results
  end

  def set_filter
    puts "\n\n\t Pas evt een filter toe"
    puts "\n\n\t Meer over filters hier: https://www.odata.org/documentation/odata-version-2-0/uri-conventions/#QueryStringOptions - section 4.5 Filter System Query Option ($filter)"
    puts "\n\n\t Voorbeeld: 'FinancialYear gt #{Time.now.year - 2}'"
    puts "\n\n Voer hier je filter in, of laat leeg voor alles:\n\n"

    gets.strip
  end

  def authenticate
    code = get_auth_code

    res = post('/oauth2/token', {
                 grant_type: 'authorization_code',
                 client_id: @client_id,
                 client_secret: @client_secret,
                 redirect_uri: @redirect_uri,
                 code: code
               }, false)

    set_tokens(res['access_token'], res['refresh_token'])
  end

  def refresh
    return if @refresh_at > Time.now

    puts "\n\nRefreshing token\n\n"

    res = post('/oauth2/token', {
                 grant_type: 'refresh_token',
                 refresh_token: @refresh_token,
                 client_id: @client_id,
                 client_secret: @client_secret
               }, false)

    set_tokens(res['access_token'], res['refresh_token'])
  end

  private

  def get_results(path)
    res = get(path)
    page = 0
    results = parse_results(res['d']['results'])
    while res = next_page(res)
      page += 1
      puts "Page #{page}"
      results += parse_results(res['d']['results'])
    end
    results
  end

  def parse_results(results)
    results.map do |result|
      result
        .reject { |_k, v| v.is_a?(Hash) }
        .map do |k, v|
        if v.is_a? String
          v.match(%r{/Date\((\d+)\)/}) do |m|
            v = Time.at(m[1].to_i / 1000)
          end
        end
        [k, v]
      end.to_h
    end
  end

  def next_page(data)
    return unless data['d']['__next']

    path = data['d']['__next'].sub(@api, '')
    get(path)
  end

  def set_tokens(access_token, refresh_token)
    @access_token = access_token
    @refresh_token = refresh_token
    @refresh_at = Time.now + 570

    File.write(File.join(Dir.pwd, 'tokens.json'),
               JSON.dump({ access_token: @access_token, refresh_token: @refresh_token, refresh_at: @refresh_at }))
  end

  def get_auth_code
    puts "\n\nEven authenticeren met Exact Online\n\n"
    puts "\nOpen onderstaande link, log in en kopieer de hele URL die je terugkrijgt hieronder:\n"
    puts "\n\t#{@api}/oauth2/auth?client_id=#{@client_id}&redirect_uri=#{@redirect_uri}&response_type=code\n\n"
    puts 'URL: '

    # url = "https://www.postman.com/oauth2/callback?code=stampNL001.88oS%21IAAAAN6zfswQmdfUSDn7f61BxSAppFz3ovkQiGWEQJGlu8D-0QEAAAHgyEoeX1NSGOpKPbzFpDwPJSBJ3llL_PVjM8iETj40uM21yV5s49JcnI_QGcqRl0p_rghPB1lUHemYlrxGg2tqesc9nXyC3-OI-J8uxeNOU-xyWP6w2GT9mY-dZ6Gwlw41O0NX8HxUrp_-DMJlJa3djTJtVOJemJcTVaOVnzTGuuTvVDatPapEHUkZGtzexjrBgl2E0BDCnJR0wfuljPlpKiCcH2ZEUTgICMb8ZpS5zNPo8CB4s_KfAx2QynFg-HUrspunYA_T--irM74eGIonQD9WZh_IKH0YlZmJOmUt6zTUdwkOn0FIdWjVe9DwTdLSzYx1Z9zEqZTa8Y99wcyaYoGzvXz6khVev0j8-oKxd-4yeMq9PH3YvwH-F8hjvZKOdOVJAUdJzxMJ0EPuqk3uxfJHDl9F4u2wfEksepdzWquIiAGZhWNEo2lf6YbZNTX-_mAcJVvRqaL8GQbeAKeS4zcoaXwvUT2FvPMVWLGqX6JLYtiTBo1ZwbN1PdbEeo091LjsGex0dsOwSTFLfcFarRcvQQ2nzQSe4SXbmd0N3EiatHTf_EAWrgncNsVjHisS0xqaSLis4XPlOkKVTbAdWvYN0Lbb-FRjWn_UpDIHzA"
    url ||= gets

    code ||= CGI.parse(URI.parse(url).query)['code'].first
  end

  def get(path)
    refresh

    uri = URI("#{@api}#{path}")
    req = Net::HTTP::Get.new uri
    req['Accept'] = 'application/json'
    req['Authorization'] = "Bearer #{@access_token}"

    res = Net::HTTP.start(
      uri.host, uri.port,
      use_ssl: uri.scheme == 'https',
      verify_mode: OpenSSL::SSL::VERIFY_NONE
    ) do |http|
      http.request req
    end

    parse_response(res, path)
  end

  def post(path, data, _should_refresh = true)
    # No need to do this, post is only for auth
    # refresh if should_refresh

    uri = URI("#{@api}#{path}")
    req = Net::HTTP::Post.new(uri)
    req['Accept'] = 'application/json'
    # req['Authorization'] = "Bearer #{@access_token}"
    req.set_form_data(data)

    res = Net::HTTP.start(
      uri.hostname, uri.port,
      use_ssl: uri.scheme == 'https',
      verify_mode: OpenSSL::SSL::VERIFY_NONE
      ) do |http|
      http.request(req)
    end

    parse_response(res, path, data)
  end

  def parse_response(response, _path, _data = nil)
    # pp response.code
    # pp response.body
    res = JSON.parse(response.body)

    # puts "\n\n"
    # puts JSON.pretty_generate({path: path, res: res, data: data})

    if res['error']
      puts "\n\nERROR\n\n"
      pp res
      puts "er ging iets mis je kan dit scherm sluiten\n\n"
    end

    res
  end
end

# Start app
begin
  Exact.new
rescue StandardError => e
  pp e
end
